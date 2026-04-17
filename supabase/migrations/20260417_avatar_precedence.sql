ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS manual_avatar_url TEXT;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS provider_avatar_url TEXT;

CREATE OR REPLACE FUNCTION public.extract_provider_avatar(raw_user_meta_data JSONB)
RETURNS TEXT AS $$
	SELECT NULLIF(
		COALESCE(
			raw_user_meta_data->>'avatar_url_google',
			raw_user_meta_data->>'picture',
			raw_user_meta_data->>'avatar_url'
		),
		''
	);
$$ LANGUAGE SQL IMMUTABLE;

UPDATE public.profiles AS profiles
SET
	manual_avatar_url = COALESCE(profiles.manual_avatar_url, profiles.avatar_url),
	provider_avatar_url = COALESCE(
		profiles.provider_avatar_url,
		public.extract_provider_avatar(users.raw_user_meta_data)
	),
	avatar_url = COALESCE(
		profiles.manual_avatar_url,
		profiles.avatar_url,
		profiles.provider_avatar_url,
		public.extract_provider_avatar(users.raw_user_meta_data)
	),
	updated_at = now()
FROM auth.users AS users
WHERE users.id = profiles.id;

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
			provider_avatar_url
		),
		email = NEW.email,
		updated_at = now()
	WHERE id = NEW.id;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

INSERT INTO public.profiles (
	id,
	display_name,
	avatar_url,
	manual_avatar_url,
	provider_avatar_url,
	email
)
SELECT
	users.id,
	COALESCE(
		users.raw_user_meta_data->>'display_name',
		users.raw_user_meta_data->>'name',
		split_part(users.email, '@', 1),
		'User'
	) AS display_name,
	COALESCE(
		profiles.manual_avatar_url,
		profiles.avatar_url,
		profiles.provider_avatar_url,
		public.extract_provider_avatar(users.raw_user_meta_data)
	) AS avatar_url,
	COALESCE(profiles.manual_avatar_url, profiles.avatar_url) AS manual_avatar_url,
	COALESCE(
		profiles.provider_avatar_url,
		public.extract_provider_avatar(users.raw_user_meta_data)
	) AS provider_avatar_url,
	users.email
FROM auth.users AS users
LEFT JOIN public.profiles AS profiles
	ON profiles.id = users.id
ON CONFLICT (id) DO UPDATE SET
	display_name = EXCLUDED.display_name,
	manual_avatar_url = COALESCE(public.profiles.manual_avatar_url, EXCLUDED.manual_avatar_url),
	provider_avatar_url = COALESCE(public.profiles.provider_avatar_url, EXCLUDED.provider_avatar_url),
	avatar_url = COALESCE(
		public.profiles.manual_avatar_url,
		public.profiles.avatar_url,
		EXCLUDED.provider_avatar_url,
		EXCLUDED.avatar_url
	),
	email = EXCLUDED.email,
	updated_at = now();
