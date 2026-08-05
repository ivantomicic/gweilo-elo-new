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

UPDATE public.profiles AS profiles
SET
	-- A legacy profile avatar is manual only when it differs from the current
	-- provider image. Never freeze a Google image as a manual override.
	manual_avatar_url = CASE
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
	END,
	provider_avatar_url = COALESCE(
		public.extract_provider_avatar(users.raw_user_meta_data),
		profiles.provider_avatar_url
	),
	avatar_url = COALESCE(
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
		END,
		public.extract_provider_avatar(users.raw_user_meta_data),
		profiles.avatar_url,
		profiles.provider_avatar_url
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
			provider_avatar_url,
			avatar_url
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
		END,
		public.extract_provider_avatar(users.raw_user_meta_data),
		profiles.provider_avatar_url,
		profiles.avatar_url
	) AS avatar_url,
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
	END AS manual_avatar_url,
	COALESCE(
		public.extract_provider_avatar(users.raw_user_meta_data),
		profiles.provider_avatar_url
	) AS provider_avatar_url,
	users.email
FROM auth.users AS users
LEFT JOIN public.profiles AS profiles
	ON profiles.id = users.id
ON CONFLICT (id) DO UPDATE SET
	display_name = EXCLUDED.display_name,
	manual_avatar_url = EXCLUDED.manual_avatar_url,
	provider_avatar_url = COALESCE(EXCLUDED.provider_avatar_url, public.profiles.provider_avatar_url),
	avatar_url = COALESCE(
		EXCLUDED.manual_avatar_url,
		EXCLUDED.provider_avatar_url,
		EXCLUDED.avatar_url,
		public.profiles.avatar_url
	),
	email = EXCLUDED.email,
	updated_at = now();
