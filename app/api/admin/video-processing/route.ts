import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, verifyAdmin } from "@/lib/supabase/admin";
import { processVideoJob } from "@/lib/video-processing/processor";
import {
	getConfiguredVideoProcessingMaxUploadBytes,
	VIDEO_PROCESSING_BUCKET,
	VIDEO_PROCESSING_MODEL,
	VIDEO_PROCESSING_PROMPT_VERSION,
	type VideoProcessingDiagnostics,
	type VideoProcessingJob,
	type VideoProcessingJobListItem,
	type VideoRallySegment,
} from "@/lib/video-processing/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE_HEADERS = {
	"Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
	Pragma: "no-cache",
};

type CreateVideoProcessingJobRequest = {
	originalFilename?: unknown;
	sourcePath?: unknown;
	sourceContentType?: unknown;
	sourceSizeBytes?: unknown;
	notes?: unknown;
};

export async function GET(request: NextRequest) {
	try {
		const authHeader = request.headers.get("authorization");
		const adminUserId = await verifyAdmin(authHeader);

		if (!adminUserId) {
			return NextResponse.json(
				{ error: "Unauthorized. Admin access required." },
				{ status: 401, headers: NO_STORE_HEADERS },
			);
		}

		const adminClient = createAdminClient();
		const diagnostics = await getVideoProcessingDiagnostics(adminClient);
		const { data, error } = await adminClient
			.from("video_processing_jobs")
			.select("*")
			.order("created_at", { ascending: false })
			.limit(50);

		if (error) {
			console.error("Failed to load video processing jobs:", error);
			return NextResponse.json(
				{ error: "Failed to load video processing jobs" },
				{ status: 500, headers: NO_STORE_HEADERS },
			);
		}

		const jobs = ((data || []) as VideoProcessingJob[]).map((job) => ({
			...job,
			segments: coerceSegments(job.segments),
		}));
		const uploaderIds = Array.from(
			new Set(jobs.map((job) => job.uploaded_by).filter(Boolean)),
		) as string[];

		const uploaderNameById = new Map<string, string>();
		if (uploaderIds.length > 0) {
			const { data: profiles } = await adminClient
				.from("profiles")
				.select("id, display_name")
				.in("id", uploaderIds);

			(profiles || []).forEach((profile) => {
				uploaderNameById.set(
					profile.id,
					profile.display_name || "Admin",
				);
			});
		}

		const enrichedJobs = await Promise.all(
			jobs.map(async (job) => {
				const [sourceSignedUrl, outputSignedUrl, thumbnailSignedUrl] =
					await Promise.all([
						createSignedUrl(adminClient, job.source_bucket, job.source_path),
						createSignedUrl(
							adminClient,
							job.output_bucket,
							job.output_path,
						),
						createSignedUrl(
							adminClient,
							job.thumbnail_bucket,
							job.thumbnail_path,
						),
					]);

				return {
					...job,
					sourceSignedUrl,
					outputSignedUrl,
					thumbnailSignedUrl,
					uploaderName: job.uploaded_by
						? uploaderNameById.get(job.uploaded_by) || "Admin"
						: null,
				} satisfies VideoProcessingJobListItem;
			}),
		);

		return NextResponse.json(
			{ jobs: enrichedJobs, diagnostics },
			{ headers: NO_STORE_HEADERS },
		);
	} catch (error) {
		console.error("Unexpected error in GET /api/admin/video-processing:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500, headers: NO_STORE_HEADERS },
		);
	}
}

export async function POST(request: NextRequest) {
	try {
		const authHeader = request.headers.get("authorization");
		const adminUserId = await verifyAdmin(authHeader);

		if (!adminUserId) {
			return NextResponse.json(
				{ error: "Unauthorized. Admin access required." },
				{ status: 401, headers: NO_STORE_HEADERS },
			);
		}

		const body =
			(await request.json()) as CreateVideoProcessingJobRequest;
		const originalFilename = getNonEmptyString(body.originalFilename);
		const sourcePath = getNonEmptyString(body.sourcePath);
		const sourceContentType = getOptionalString(body.sourceContentType);
		const notes = getOptionalString(body.notes);
		const sourceSizeBytes = getOptionalPositiveNumber(body.sourceSizeBytes);
		const configuredUploadLimitBytes =
			getConfiguredVideoProcessingMaxUploadBytes();

		if (!originalFilename || !sourcePath) {
			return NextResponse.json(
				{ error: "originalFilename and sourcePath are required." },
				{ status: 400, headers: NO_STORE_HEADERS },
			);
		}

		if (
			sourceSizeBytes !== null &&
			sourceSizeBytes > configuredUploadLimitBytes
		) {
			return NextResponse.json(
				{
					error: `File is ${formatBytes(
						sourceSizeBytes,
					)}, which exceeds the configured upload cap of ${formatBytes(
						configuredUploadLimitBytes,
					)}.`,
				},
				{ status: 413, headers: NO_STORE_HEADERS },
			);
		}

		const adminClient = createAdminClient();
		const { data, error } = await adminClient
			.from("video_processing_jobs")
			.insert({
				uploaded_by: adminUserId,
				original_filename: originalFilename,
				source_bucket: VIDEO_PROCESSING_BUCKET,
				source_path: sourcePath,
				source_content_type: sourceContentType,
				source_size_bytes: sourceSizeBytes,
				processor_vendor: "google",
				processor_model: VIDEO_PROCESSING_MODEL,
				prompt_version: VIDEO_PROCESSING_PROMPT_VERSION,
				status: "queued",
				notes,
			})
			.select("*")
			.single();

		if (error || !data) {
			console.error("Failed to create video processing job:", error);
			const duplicateSource =
				error?.message?.toLowerCase().includes("duplicate");

			return NextResponse.json(
				{
					error: duplicateSource
						? "This upload has already been queued."
						: "Failed to create video processing job",
				},
				{
					status: duplicateSource ? 409 : 500,
					headers: NO_STORE_HEADERS,
				},
			);
		}

		void processVideoJob(data.id).catch((jobError) => {
			console.error(
				`Background processing failed for video job ${data.id}:`,
				jobError,
			);
		});

		return NextResponse.json(
			{
				job: {
					...(data as VideoProcessingJob),
					segments: coerceSegments(data.segments),
				},
			},
			{ status: 201, headers: NO_STORE_HEADERS },
		);
	} catch (error) {
		console.error("Unexpected error in POST /api/admin/video-processing:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500, headers: NO_STORE_HEADERS },
		);
	}
}

async function createSignedUrl(
	adminClient: ReturnType<typeof createAdminClient>,
	bucket: string | null,
	path: string | null,
) {
	if (!bucket || !path) {
		return null;
	}

	const { data, error } = await adminClient.storage
		.from(bucket)
		.createSignedUrl(path, 60 * 60);

	if (error || !data?.signedUrl) {
		console.error(`Failed to create signed URL for ${bucket}/${path}:`, error);
		return null;
	}

	return data.signedUrl;
}

async function getVideoProcessingDiagnostics(
	adminClient: ReturnType<typeof createAdminClient>,
): Promise<VideoProcessingDiagnostics> {
	const configuredUploadLimitBytes =
		getConfiguredVideoProcessingMaxUploadBytes();
	const { data, error } = await adminClient.storage.getBucket(
		VIDEO_PROCESSING_BUCKET,
	);

	if (error || !data) {
		console.error(
			`Failed to load storage bucket metadata for ${VIDEO_PROCESSING_BUCKET}:`,
			error,
		);
		return {
			configuredUploadLimitBytes,
			bucketFileSizeLimitBytes: null,
			allowedMimeTypes: [],
		};
	}

	return {
		configuredUploadLimitBytes,
		bucketFileSizeLimitBytes: data.file_size_limit ?? null,
		allowedMimeTypes: data.allowed_mime_types || [],
	};
}

function coerceSegments(value: unknown): VideoRallySegment[] {
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

function getNonEmptyString(value: unknown) {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function getOptionalString(value: unknown) {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function getOptionalPositiveNumber(value: unknown) {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) {
		return value;
	}

	return null;
}

function formatBytes(value: number) {
	const units = ["B", "KB", "MB", "GB"];
	let currentValue = value;
	let unitIndex = 0;

	while (currentValue >= 1024 && unitIndex < units.length - 1) {
		currentValue /= 1024;
		unitIndex += 1;
	}

	return `${currentValue.toFixed(currentValue >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
