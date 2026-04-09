export const VIDEO_PROCESSING_BUCKET = "video-processing";
export const VIDEO_PROCESSING_MODEL = "gemini-2.5-flash";
export const VIDEO_PROCESSING_PROMPT_VERSION = "rally-v1";
export const DEFAULT_VIDEO_PROCESSING_MAX_UPLOAD_BYTES =
	50 * 1024 * 1024;

export const VIDEO_PROCESSING_STATUSES = [
	"queued",
	"analyzing",
	"cutting",
	"ready",
	"failed",
] as const;

export type VideoProcessingStatus =
	(typeof VIDEO_PROCESSING_STATUSES)[number];

export type VideoRallySegment = {
	startSeconds: number;
	endSeconds: number;
	confidence: number | null;
	reason: string | null;
};

export type VideoProcessingJob = {
	id: string;
	created_at: string;
	updated_at: string;
	uploaded_by: string | null;
	original_filename: string;
	source_bucket: string;
	source_path: string;
	source_content_type: string | null;
	source_size_bytes: number | null;
	processor_vendor: string;
	processor_model: string;
	prompt_version: string;
	status: VideoProcessingStatus;
	notes: string | null;
	segments: VideoRallySegment[];
	segments_count: number;
	segments_duration_seconds: number | null;
	output_bucket: string | null;
	output_path: string | null;
	thumbnail_bucket: string | null;
	thumbnail_path: string | null;
	processing_started_at: string | null;
	processing_completed_at: string | null;
	error_message: string | null;
};

export type VideoProcessingJobListItem = VideoProcessingJob & {
	sourceSignedUrl: string | null;
	outputSignedUrl: string | null;
	thumbnailSignedUrl: string | null;
	uploaderName: string | null;
};

export type VideoProcessingDiagnostics = {
	configuredUploadLimitBytes: number;
	bucketFileSizeLimitBytes: number | null;
	allowedMimeTypes: string[];
};

export function sanitizeFilename(filename: string) {
	return filename
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

export function buildUploadedVideoStoragePath(
	userId: string,
	originalFilename: string,
	timestamp = Date.now(),
) {
	const safeName = sanitizeFilename(originalFilename) || "video.mp4";
	return `uploads/${userId}/${timestamp}-${safeName}`;
}

export function normalizeSegments(segments: VideoRallySegment[]) {
	const cleaned = segments
		.map((segment) => ({
			startSeconds: roundToMilliseconds(segment.startSeconds),
			endSeconds: roundToMilliseconds(segment.endSeconds),
			confidence:
				typeof segment.confidence === "number"
					? clamp(segment.confidence, 0, 1)
					: null,
			reason: segment.reason?.trim() || null,
		}))
		.filter(
			(segment) =>
				Number.isFinite(segment.startSeconds) &&
				Number.isFinite(segment.endSeconds) &&
				segment.endSeconds > segment.startSeconds,
		)
		.sort((a, b) => a.startSeconds - b.startSeconds);

	if (cleaned.length === 0) {
		return cleaned;
	}

	const merged: VideoRallySegment[] = [cleaned[0]];

	for (const segment of cleaned.slice(1)) {
		const previous = merged[merged.length - 1];

		if (segment.startSeconds <= previous.endSeconds + 2) {
			previous.endSeconds = Math.max(
				previous.endSeconds,
				segment.endSeconds,
			);
			previous.confidence =
				previous.confidence !== null && segment.confidence !== null
					? roundToMilliseconds(
							(previous.confidence + segment.confidence) / 2,
					  )
					: previous.confidence ?? segment.confidence;
			if (!previous.reason && segment.reason) {
				previous.reason = segment.reason;
			}
			continue;
		}

		merged.push(segment);
	}

	return merged;
}

export function addSegmentPadding(
	segments: VideoRallySegment[],
	videoDurationSeconds: number,
	paddingBeforeSeconds = 0.35,
	paddingAfterSeconds = 0.2,
) {
	if (!Number.isFinite(videoDurationSeconds) || videoDurationSeconds <= 0) {
		return segments;
	}

	return normalizeSegments(
		segments.map((segment) => ({
			...segment,
			startSeconds: Math.max(
				0,
				segment.startSeconds - paddingBeforeSeconds,
			),
			endSeconds: Math.min(
				videoDurationSeconds,
				segment.endSeconds + paddingAfterSeconds,
			),
		})),
	);
}

export function sumSegmentDuration(segments: VideoRallySegment[]) {
	return roundToMilliseconds(
		segments.reduce(
			(total, segment) => total + (segment.endSeconds - segment.startSeconds),
			0,
		),
	);
}

export function getConfiguredVideoProcessingMaxUploadBytes() {
	const rawValue = process.env.NEXT_PUBLIC_VIDEO_PROCESSING_MAX_UPLOAD_MB;
	const parsedMegabytes = rawValue ? Number(rawValue) : Number.NaN;

	if (Number.isFinite(parsedMegabytes) && parsedMegabytes > 0) {
		return Math.round(parsedMegabytes * 1024 * 1024);
	}

	return DEFAULT_VIDEO_PROCESSING_MAX_UPLOAD_BYTES;
}

function roundToMilliseconds(value: number) {
	return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}
