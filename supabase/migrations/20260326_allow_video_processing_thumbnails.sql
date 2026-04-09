-- Allow generated thumbnails to be stored in the video-processing bucket.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
	'video/mp4',
	'video/mpeg',
	'video/mov',
	'video/quicktime',
	'video/x-matroska',
	'video/webm',
	'video/avi',
	'image/jpeg',
	'image/png',
	'image/webp'
]
WHERE id = 'video-processing';
