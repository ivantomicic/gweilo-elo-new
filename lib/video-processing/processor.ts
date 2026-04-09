import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeVideoRalliesWithGemini } from "@/lib/video-processing/gemini";
import {
	addSegmentPadding,
	normalizeSegments,
	sumSegmentDuration,
	VIDEO_PROCESSING_BUCKET,
	type VideoProcessingJob,
	type VideoRallySegment,
} from "@/lib/video-processing/shared";

const execFileAsync = promisify(execFile);
const GEMINI_ANALYSIS_CHUNK_SECONDS = 2 * 60;
const GEMINI_ANALYSIS_CHUNK_OVERLAP_SECONDS = 4;

export async function processVideoJob(jobId: string) {
	const adminClient = createAdminClient();
	const job = await getJob(adminClient, jobId);

	if (
		job.status !== "queued" &&
		job.status !== "failed" &&
		job.status !== "analyzing"
	) {
		return job;
	}

	await updateJob(adminClient, jobId, {
		status: "analyzing",
		error_message: null,
		processing_started_at: new Date().toISOString(),
		processing_completed_at: null,
		updated_at: new Date().toISOString(),
	});

	const tempDirectory = await mkdtemp(join(tmpdir(), "gweilo-video-job-"));

	try {
		const sourceBytes = await downloadSourceVideo(
			job.source_bucket,
			job.source_path,
		);
		const sourceExtension = extname(job.source_path) || ".mp4";
		const sourceFilePath = join(tempDirectory, `source${sourceExtension}`);
		await writeFile(sourceFilePath, Buffer.from(sourceBytes));

		const detectedMimeType =
			job.source_content_type || mimeTypeFromExtension(sourceExtension);
		const videoDurationSeconds = await getVideoDurationSeconds(sourceFilePath);

			const rawSegments = await analyzeVideoRalliesAcrossChunks({
				sourceFilePath,
				mimeType: detectedMimeType,
				notes: job.notes,
				videoDurationSeconds,
				tempDirectory,
			});

		const normalizedSegments = addSegmentPadding(
			normalizeSegments(rawSegments),
			videoDurationSeconds,
		);

		if (normalizedSegments.length === 0) {
			throw new Error(
				"No rally segments were detected. Try a clearer clip or more specific notes.",
			);
		}

		await updateJob(adminClient, jobId, {
			status: "cutting",
			segments: normalizedSegments,
			segments_count: normalizedSegments.length,
			segments_duration_seconds: sumSegmentDuration(normalizedSegments),
			updated_at: new Date().toISOString(),
		});

		const outputFilePath = join(tempDirectory, "only-rallies.mp4");
		const thumbnailFilePath = join(tempDirectory, "thumbnail.jpg");

		await renderSegmentsWithFfmpeg({
			sourceFilePath,
			outputFilePath,
			segments: normalizedSegments,
		});
		await generateThumbnail({
			videoFilePath: outputFilePath,
			thumbnailFilePath,
		});

		const outputStoragePath = `processed/${job.id}/only-rallies.mp4`;
		const thumbnailStoragePath = `processed/${job.id}/thumbnail.jpg`;

			await uploadProcessingArtifact({
				bucket: VIDEO_PROCESSING_BUCKET,
				path: outputStoragePath,
				filePath: outputFilePath,
				contentType: "video/mp4",
			});
			let thumbnailUploaded = false;
			try {
				await uploadProcessingArtifact({
					bucket: VIDEO_PROCESSING_BUCKET,
					path: thumbnailStoragePath,
					filePath: thumbnailFilePath,
					contentType: "image/jpeg",
				});
				thumbnailUploaded = true;
			} catch (thumbnailError) {
				console.error(
					`[video-processing] Thumbnail upload failed for job ${job.id}:`,
					thumbnailError,
				);
			}

			await updateJob(adminClient, jobId, {
				status: "ready",
				output_bucket: VIDEO_PROCESSING_BUCKET,
				output_path: outputStoragePath,
				thumbnail_bucket: thumbnailUploaded
					? VIDEO_PROCESSING_BUCKET
					: null,
				thumbnail_path: thumbnailUploaded
					? thumbnailStoragePath
					: null,
				processing_completed_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			});

		return await getJob(adminClient, jobId);
	} catch (error) {
		const message = getErrorMessage(error);
		console.error(`[video-processing] Job ${jobId} failed:`, error);

		await updateJob(adminClient, jobId, {
			status: "failed",
			error_message: message,
			processing_completed_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		});

		throw error;
	} finally {
		await rm(tempDirectory, { recursive: true, force: true });
	}
}

async function getJob(adminClient: ReturnType<typeof createAdminClient>, jobId: string) {
	const { data, error } = await adminClient
		.from("video_processing_jobs")
		.select("*")
		.eq("id", jobId)
		.single();

	if (error || !data) {
		throw new Error(`Video processing job ${jobId} was not found.`);
	}

	return {
		...data,
		segments: parseSegments(data.segments),
	} as VideoProcessingJob;
}

async function updateJob(
	adminClient: ReturnType<typeof createAdminClient>,
	jobId: string,
	values: Record<string, unknown>,
) {
	const { error } = await adminClient
		.from("video_processing_jobs")
		.update(values)
		.eq("id", jobId);

	if (error) {
		throw new Error(`Failed to update video processing job ${jobId}.`);
	}
}

async function downloadSourceVideo(bucket: string, path: string) {
	const adminClient = createAdminClient();
	const { data, error } = await adminClient.storage.from(bucket).download(path);

	if (error || !data) {
		throw new Error(`Failed to download source video ${path}.`);
	}

	return await data.arrayBuffer();
}

async function uploadProcessingArtifact(options: {
	bucket: string;
	path: string;
	filePath: string;
	contentType: string;
}) {
	const adminClient = createAdminClient();
	const bytes = await readFile(options.filePath);
	const { error } = await adminClient.storage
		.from(options.bucket)
		.upload(options.path, bytes, {
			contentType: options.contentType,
			upsert: true,
		});

	if (error) {
		throw new Error(
			`Failed to upload artifact ${options.path}: ${error.message}`,
		);
	}
}

async function getVideoDurationSeconds(sourceFilePath: string) {
	try {
		const { stdout } = await execFileAsync("ffprobe", [
			"-v",
			"error",
			"-show_entries",
			"format=duration",
			"-of",
			"default=noprint_wrappers=1:nokey=1",
			sourceFilePath,
		]);

		const duration = Number.parseFloat(stdout.trim());
		if (!Number.isFinite(duration) || duration <= 0) {
			throw new Error("Invalid duration returned by ffprobe.");
		}

		return duration;
	} catch (error) {
		throw new Error(
			`ffprobe is required for video processing and failed to read the upload: ${getErrorMessage(
				error,
			)}`,
		);
	}
}

async function renderSegmentsWithFfmpeg(options: {
	sourceFilePath: string;
	outputFilePath: string;
	segments: VideoRallySegment[];
}) {
	const audioStreamPresent = await hasAudioStream(options.sourceFilePath);
	const filterParts: string[] = [];
	const concatInputs: string[] = [];

	options.segments.forEach((segment, index) => {
		filterParts.push(
			`[0:v]trim=start=${segment.startSeconds}:end=${segment.endSeconds},setpts=PTS-STARTPTS[v${index}]`,
		);
		concatInputs.push(`[v${index}]`);

		if (audioStreamPresent) {
			filterParts.push(
				`[0:a]atrim=start=${segment.startSeconds}:end=${segment.endSeconds},asetpts=PTS-STARTPTS[a${index}]`,
			);
			concatInputs.push(`[a${index}]`);
		}
	});

	filterParts.push(
		`${concatInputs.join("")}concat=n=${options.segments.length}:v=1:a=${
			audioStreamPresent ? 1 : 0
		}[outv]${audioStreamPresent ? "[outa]" : ""}`,
	);

	const args = [
		"-y",
		"-i",
		options.sourceFilePath,
		"-filter_complex",
		filterParts.join(";"),
		"-map",
		"[outv]",
	];

	if (audioStreamPresent) {
		args.push("-map", "[outa]", "-c:a", "aac", "-b:a", "128k");
	} else {
		args.push("-an");
	}

	args.push(
		"-c:v",
		"libx264",
		"-preset",
		"medium",
		"-crf",
		"21",
		"-movflags",
		"+faststart",
		options.outputFilePath,
	);

	try {
		await execFileAsync("ffmpeg", args);
	} catch (error) {
		throw new Error(
			`ffmpeg failed while cutting the output video: ${getErrorMessage(error)}`,
		);
	}
}

async function generateThumbnail(options: {
	videoFilePath: string;
	thumbnailFilePath: string;
}) {
	try {
		await execFileAsync("ffmpeg", [
			"-y",
			"-ss",
			"0.2",
			"-i",
			options.videoFilePath,
			"-frames:v",
			"1",
			options.thumbnailFilePath,
		]);
	} catch (error) {
		throw new Error(
			`ffmpeg failed while generating a thumbnail: ${getErrorMessage(error)}`,
		);
	}
}

async function hasAudioStream(sourceFilePath: string) {
	try {
		const { stdout } = await execFileAsync("ffprobe", [
			"-v",
			"error",
			"-select_streams",
			"a",
			"-show_entries",
			"stream=index",
			"-of",
			"csv=p=0",
			sourceFilePath,
		]);

		return stdout.trim().length > 0;
	} catch {
		return false;
	}
}

function parseSegments(value: unknown): VideoRallySegment[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.flatMap((segment) => {
		if (!segment || typeof segment !== "object") {
			return [];
		}

		const candidate = segment as Record<string, unknown>;
		const startSeconds = Number(candidate.startSeconds);
		const endSeconds = Number(candidate.endSeconds);

		if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) {
			return [];
		}

		return [
			{
				startSeconds,
				endSeconds,
				confidence:
					typeof candidate.confidence === "number"
						? candidate.confidence
						: null,
				reason:
					typeof candidate.reason === "string"
						? candidate.reason
						: null,
			},
		];
	});
}

function mimeTypeFromExtension(extension: string) {
	switch (extension.toLowerCase()) {
		case ".mov":
			return "video/mov";
		case ".mkv":
			return "video/x-matroska";
		case ".webm":
			return "video/webm";
		case ".avi":
			return "video/avi";
		default:
			return "video/mp4";
	}
}

function getErrorMessage(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

async function analyzeVideoRalliesAcrossChunks(options: {
	sourceFilePath: string;
	mimeType: string;
	notes?: string | null;
	videoDurationSeconds: number;
	tempDirectory: string;
}) {
	if (options.videoDurationSeconds <= GEMINI_ANALYSIS_CHUNK_SECONDS) {
		return await analyzeVideoRalliesWithGemini({
			filePath: options.sourceFilePath,
			mimeType: options.mimeType,
			notes: options.notes,
		});
	}

	const allSegments: VideoRallySegment[] = [];
	const chunkRanges = buildChunkRanges(options.videoDurationSeconds);

	for (let index = 0; index < chunkRanges.length; index += 1) {
		const chunk = chunkRanges[index];
		const chunkFilePath = join(options.tempDirectory, `analysis-${index}.mp4`);

		await createAnalysisChunk({
			sourceFilePath: options.sourceFilePath,
			outputFilePath: chunkFilePath,
			startSeconds: chunk.startSeconds,
			durationSeconds: chunk.durationSeconds,
		});

		const chunkSegments = await analyzeVideoRalliesWithGemini({
			filePath: chunkFilePath,
			mimeType: options.mimeType,
			notes:
				chunkRanges.length > 1
					? `${options.notes ? `${options.notes}\n` : ""}This file is chunk ${
							index + 1
					  } of ${chunkRanges.length} from the original match.`
					: options.notes,
		});

		for (const segment of chunkSegments) {
			allSegments.push({
				...segment,
				startSeconds: segment.startSeconds + chunk.startSeconds,
				endSeconds: segment.endSeconds + chunk.startSeconds,
			});
		}
	}

	return allSegments;
}

function buildChunkRanges(videoDurationSeconds: number) {
	const ranges: Array<{ startSeconds: number; durationSeconds: number }> = [];
	let startSeconds = 0;

	while (startSeconds < videoDurationSeconds) {
		const remainingSeconds = videoDurationSeconds - startSeconds;
		const durationSeconds = Math.min(
			GEMINI_ANALYSIS_CHUNK_SECONDS,
			remainingSeconds,
		);

		ranges.push({
			startSeconds,
			durationSeconds,
		});

		if (startSeconds + durationSeconds >= videoDurationSeconds) {
			break;
		}

		startSeconds +=
			GEMINI_ANALYSIS_CHUNK_SECONDS - GEMINI_ANALYSIS_CHUNK_OVERLAP_SECONDS;
	}

	return ranges;
}

async function createAnalysisChunk(options: {
	sourceFilePath: string;
	outputFilePath: string;
	startSeconds: number;
	durationSeconds: number;
}) {
	try {
		await execFileAsync("ffmpeg", [
			"-y",
			"-ss",
			String(options.startSeconds),
			"-i",
			options.sourceFilePath,
			"-t",
			String(options.durationSeconds),
			"-vf",
			"scale='min(1280,iw)':-2",
			"-c:v",
			"libx264",
			"-preset",
			"veryfast",
			"-crf",
			"28",
			"-c:a",
			"aac",
			"-b:a",
			"96k",
			"-movflags",
			"+faststart",
			options.outputFilePath,
		]);
	} catch (error) {
		throw new Error(
			`ffmpeg failed while creating an analysis chunk: ${getErrorMessage(error)}`,
		);
	}
}
