-- Repair environments where the original avatar-precedence migration may
-- already have classified every existing avatar (including Google avatars) as
-- manual. App-uploaded avatars use Supabase Storage (or legacy data URLs), so
-- a googleusercontent.com URL must never become a sticky manual override.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS manual_avatar_url TEXT;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS provider_avatar_url TEXT;

CREATE OR REPLACE FUNCTION public.extract_provider_avatar(raw_user_meta_data JSONB)
RETURNS TEXT AS $$
	SELECT NULLIF(
		COALESCE(
			raw_user_meta_data->>'avatar_url_google',
			raw_user_meta_data->>'picture'
		),
		''
	);
$$ LANGUAGE SQL IMMUTABLE;

WITH classified AS (
	SELECT
		profiles.id,
		CASE
			WHEN profiles.manual_avatar_url IS NOT NULL
				AND profiles.manual_avatar_url IS DISTINCT FROM
					public.extract_provider_avatar(users.raw_user_meta_data)
				AND profiles.manual_avatar_url !~* '^https://[^/]*googleusercontent\.com/'
				THEN profiles.manual_avatar_url
			WHEN profiles.avatar_url IS NOT NULL
				AND profiles.avatar_url IS DISTINCT FROM
					public.extract_provider_avatar(users.raw_user_meta_data)
				AND profiles.avatar_url !~* '^https://[^/]*googleusercontent\.com/'
				THEN profiles.avatar_url
			ELSE NULL
		END AS manual_avatar,
		COALESCE(
			public.extract_provider_avatar(users.raw_user_meta_data),
			profiles.provider_avatar_url
		) AS provider_avatar,
		profiles.avatar_url AS previous_avatar
	FROM public.profiles AS profiles
	JOIN auth.users AS users ON users.id = profiles.id
)
UPDATE public.profiles AS profiles
SET
	manual_avatar_url = classified.manual_avatar,
	provider_avatar_url = classified.provider_avatar,
	avatar_url = COALESCE(
		classified.manual_avatar,
		classified.provider_avatar,
		classified.previous_avatar
	),
	updated_at = now()
FROM classified
WHERE classified.id = profiles.id;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
	provider_avatar TEXT := public.extract_provider_avatar(NEW.raw_user_meta_data);
BEGIN
	INSERT INTO public.profiles (
		id,
		display_name,
		avatar_url,
		manual_avatar_url,
		provider_avatar_url,
		email
	)
	VALUES (
		NEW.id,
		COALESCE(
			NEW.raw_user_meta_data->>'display_name',
			NEW.raw_user_meta_data->>'name',
			split_part(NEW.email, '@', 1),
			'User'
		),
		provider_avatar,
		NULL,
		provider_avatar,
		NEW.email
	);
	RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION handle_user_update()
RETURNS TRIGGER AS $$
DECLARE
	provider_avatar TEXT := public.extract_provider_avatar(NEW.raw_user_meta_data);
BEGIN
	UPDATE public.profiles
	SET
		display_name = COALESCE(
			NEW.raw_user_meta_data->>'display_name',
			NEW.raw_user_meta_data->>'name',
			split_part(NEW.email, '@', 1),
			display_name
		),
		provider_avatar_url = COALESCE(provider_avatar, provider_avatar_url),
		avatar_url = COALESCE(
			manual_avatar_url,
			provider_avatar,
			provider_avatar_url,
			avatar_url
		),
		email = NEW.email,
		updated_at = now()
	WHERE id = NEW.id;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
