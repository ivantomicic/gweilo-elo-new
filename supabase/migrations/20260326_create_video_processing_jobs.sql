-- Create admin-managed video processing queue and storage bucket.

INSERT INTO storage.buckets (
	id,
	name,
	public,
	file_size_limit,
	allowed_mime_types
)
VALUES (
	'video-processing',
	'video-processing',
	false,
	2147483648,
	ARRAY[
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
)
ON CONFLICT (id) DO UPDATE
SET
	public = EXCLUDED.public,
	file_size_limit = EXCLUDED.file_size_limit,
	allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins can read video-processing files" ON storage.objects;
CREATE POLICY "Admins can read video-processing files"
	ON storage.objects
	FOR SELECT
	TO authenticated
	USING (
		bucket_id = 'video-processing'
		AND public.is_admin()
	);

DROP POLICY IF EXISTS "Admins can upload video-processing files" ON storage.objects;
CREATE POLICY "Admins can upload video-processing files"
	ON storage.objects
	FOR INSERT
	TO authenticated
	WITH CHECK (
		bucket_id = 'video-processing'
		AND public.is_admin()
	);

DROP POLICY IF EXISTS "Admins can update video-processing files" ON storage.objects;
CREATE POLICY "Admins can update video-processing files"
	ON storage.objects
	FOR UPDATE
	TO authenticated
	USING (
		bucket_id = 'video-processing'
		AND public.is_admin()
	)
	WITH CHECK (
		bucket_id = 'video-processing'
		AND public.is_admin()
	);

DROP POLICY IF EXISTS "Admins can delete video-processing files" ON storage.objects;
CREATE POLICY "Admins can delete video-processing files"
	ON storage.objects
	FOR DELETE
	TO authenticated
	USING (
		bucket_id = 'video-processing'
		AND public.is_admin()
	);

CREATE TABLE IF NOT EXISTS public.video_processing_jobs (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
	updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
	uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
	original_filename text NOT NULL,
	source_bucket text NOT NULL DEFAULT 'video-processing',
	source_path text NOT NULL UNIQUE,
	source_content_type text,
	source_size_bytes bigint,
	processor_vendor text NOT NULL DEFAULT 'google',
	processor_model text NOT NULL DEFAULT 'gemini-2.5-flash',
	prompt_version text NOT NULL DEFAULT 'rally-v1',
	status text NOT NULL DEFAULT 'queued'
		CHECK (status IN ('queued', 'analyzing', 'cutting', 'ready', 'failed')),
	notes text,
	segments jsonb NOT NULL DEFAULT '[]'::jsonb,
	segments_count integer NOT NULL DEFAULT 0,
	segments_duration_seconds numeric(10, 3),
	output_bucket text,
	output_path text,
	thumbnail_bucket text,
	thumbnail_path text,
	processing_started_at timestamptz,
	processing_completed_at timestamptz,
	error_message text
);

CREATE INDEX IF NOT EXISTS video_processing_jobs_status_created_at_idx
	ON public.video_processing_jobs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS video_processing_jobs_uploaded_by_idx
	ON public.video_processing_jobs (uploaded_by, created_at DESC);

ALTER TABLE public.video_processing_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage video processing jobs" ON public.video_processing_jobs;
CREATE POLICY "Admins can manage video processing jobs"
	ON public.video_processing_jobs
	FOR ALL
	TO authenticated
	USING (public.is_admin())
	WITH CHECK (public.is_admin());
