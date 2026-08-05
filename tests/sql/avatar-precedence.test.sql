\set ON_ERROR_STOP on

CREATE SCHEMA auth;
CREATE TABLE auth.users (
	id uuid PRIMARY KEY,
	email text,
	raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.profiles (
	id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
	display_name text NOT NULL DEFAULT 'User',
	avatar_url text,
	email text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
	(
		'10000000-0000-4000-8000-000000000001',
		'provider@example.com',
		'{"name":"Provider","picture":"https://lh3.googleusercontent.com/provider-old"}'
	),
	(
		'10000000-0000-4000-8000-000000000002',
		'manual@example.com',
		'{"name":"Manual","picture":"https://lh3.googleusercontent.com/manual-provider-old"}'
	),
	(
		'10000000-0000-4000-8000-000000000003',
		'email@example.com',
		'{"name":"Email only"}'
	);

INSERT INTO public.profiles (id, display_name, avatar_url, email) VALUES
	(
		'10000000-0000-4000-8000-000000000001',
		'Provider',
		'https://lh3.googleusercontent.com/provider-old',
		'provider@example.com'
	),
	(
		'10000000-0000-4000-8000-000000000002',
		'Manual',
		'https://project.supabase.co/storage/v1/object/public/avatars/manual.jpg',
		'manual@example.com'
	),
	(
		'10000000-0000-4000-8000-000000000003',
		'Email only',
		'data:image/png;base64,manual',
		'email@example.com'
	);

\ir ../../supabase/migrations/20260417_avatar_precedence.sql

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
	AFTER INSERT ON auth.users
	FOR EACH ROW EXECUTE FUNCTION handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
	AFTER UPDATE ON auth.users
	FOR EACH ROW EXECUTE FUNCTION handle_user_update();

DO $$
BEGIN
	IF (
		SELECT manual_avatar_url
		FROM public.profiles
		WHERE id = '10000000-0000-4000-8000-000000000001'
	) IS NOT NULL THEN
		RAISE EXCEPTION 'provider image was incorrectly backfilled as manual';
	END IF;

	IF (
		SELECT manual_avatar_url
		FROM public.profiles
		WHERE id = '10000000-0000-4000-8000-000000000002'
	) <> 'https://project.supabase.co/storage/v1/object/public/avatars/manual.jpg' THEN
		RAISE EXCEPTION 'storage avatar was not backfilled as manual';
	END IF;

	IF (
		SELECT manual_avatar_url
		FROM public.profiles
		WHERE id = '10000000-0000-4000-8000-000000000003'
	) <> 'data:image/png;base64,manual' THEN
		RAISE EXCEPTION 'legacy data avatar was not backfilled as manual';
	END IF;
END;
$$;

-- Simulate an environment that already ran the unsafe historical backfill.
UPDATE public.profiles
SET manual_avatar_url = avatar_url
WHERE id = '10000000-0000-4000-8000-000000000001';

\ir ../../supabase/migrations/202608050001_safe_avatar_precedence.sql

DO $$
BEGIN
	IF (
		SELECT manual_avatar_url
		FROM public.profiles
		WHERE id = '10000000-0000-4000-8000-000000000001'
	) IS NOT NULL THEN
		RAISE EXCEPTION 'repair migration did not clear polluted provider override';
	END IF;
END;
$$;

-- A provider refresh updates the effective avatar when no manual override exists.
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
	raw_user_meta_data,
	'{picture}',
	'"https://lh3.googleusercontent.com/provider-new"'
)
WHERE id = '10000000-0000-4000-8000-000000000001';

-- The latest provider is retained for fallback, but the manual avatar remains effective.
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
	raw_user_meta_data,
	'{picture}',
	'"https://lh3.googleusercontent.com/manual-provider-new"'
)
WHERE id = '10000000-0000-4000-8000-000000000002';

DO $$
BEGIN
	IF (
		SELECT avatar_url
		FROM public.profiles
		WHERE id = '10000000-0000-4000-8000-000000000001'
	) <> 'https://lh3.googleusercontent.com/provider-new' THEN
		RAISE EXCEPTION 'provider refresh did not update effective avatar';
	END IF;

	IF (
		SELECT avatar_url
		FROM public.profiles
		WHERE id = '10000000-0000-4000-8000-000000000002'
	) <> 'https://project.supabase.co/storage/v1/object/public/avatars/manual.jpg' THEN
		RAISE EXCEPTION 'provider refresh replaced manual avatar';
	END IF;

	IF (
		SELECT provider_avatar_url
		FROM public.profiles
		WHERE id = '10000000-0000-4000-8000-000000000002'
	) <> 'https://lh3.googleusercontent.com/manual-provider-new' THEN
		RAISE EXCEPTION 'latest provider avatar was not retained for fallback';
	END IF;
END;
$$;

-- Clearing a manual override falls back to the latest provider image.
UPDATE public.profiles
SET
	manual_avatar_url = NULL,
	avatar_url = provider_avatar_url
WHERE id = '10000000-0000-4000-8000-000000000002';

DO $$
BEGIN
	IF (
		SELECT avatar_url
		FROM public.profiles
		WHERE id = '10000000-0000-4000-8000-000000000002'
	) <> 'https://lh3.googleusercontent.com/manual-provider-new' THEN
		RAISE EXCEPTION 'clearing manual avatar did not fall back to provider';
	END IF;
END;
$$;

SELECT 'avatar precedence SQL integration tests passed' AS result;
