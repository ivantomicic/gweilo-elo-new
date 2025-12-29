/**
 * Video provider types
 */
export type VideoProvider = "youtube" | "unknown";

/**
 * Detect video provider from URL
 * 
 * @param url - Video URL
 * @returns Provider type ("youtube" or "unknown")
 */
export function detectVideoProvider(url: string): VideoProvider {
	if (!url) return "unknown";

	const cleanUrl = url.trim().toLowerCase();

	if (cleanUrl.includes("youtube.com") || cleanUrl.includes("youtu.be")) {
		return "youtube";
	}

	return "unknown";
}

/**
 * Extract video ID from URL based on provider
 * 
 * @param url - Video URL
 * @returns Video ID if extraction succeeds, null otherwise
 */
export function extractVideoId(url: string): string | null {
	const provider = detectVideoProvider(url);

	switch (provider) {
		case "youtube":
			return extractYouTubeVideoId(url);
		default:
			return null;
	}
}

/**
 * Extract YouTube video ID from various YouTube URL formats
 * 
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 */
function extractYouTubeVideoId(url: string): string | null {
	if (!url) return null;

	// Remove whitespace
	const cleanUrl = url.trim();

	// Pattern 1: youtube.com/watch?v=VIDEO_ID
	const watchMatch = cleanUrl.match(/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/);
	if (watchMatch && watchMatch[1]) {
		return watchMatch[1];
	}

	// Pattern 2: youtu.be/VIDEO_ID
	const shortMatch = cleanUrl.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
	if (shortMatch && shortMatch[1]) {
		return shortMatch[1];
	}

	return null;
}

/**
 * Get video thumbnail URL based on provider
 * 
 * @param url - Video URL
 * @returns Thumbnail URL if available, null otherwise
 */
export function getVideoThumbnailUrl(url: string): string | null {
	const provider = detectVideoProvider(url);
	const videoId = extractVideoId(url);

	if (!videoId) return null;

	switch (provider) {
		case "youtube":
			return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
		default:
			return null;
	}
}

/**
 * Validate video URL
 * 
 * Currently supports YouTube URLs. Can be extended for other providers.
 * 
 * @param url - Video URL to validate
 * @returns true if URL is valid (or empty), false otherwise
 */
export function isValidVideoUrl(url: string): boolean {
	const trimmed = url.trim();
	if (trimmed === "") return true; // Empty is valid (clears link)

	const provider = detectVideoProvider(trimmed);
	
	switch (provider) {
		case "youtube":
			// For YouTube, just check if it contains the domain
			return trimmed.includes("youtube.com") || trimmed.includes("youtu.be");
		default:
			// For now, only YouTube is supported
			return false;
	}
}

