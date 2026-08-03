-- Supabase's safe-update protection requires DELETE statements to include a
-- WHERE clause, including those executed inside security-definer functions.
CREATE OR REPLACE FUNCTION public.update_profile_name_cases(p_updates JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_update JSONB;
	v_profile_id UUID;
	v_updated_rows INTEGER;
	v_total_updated INTEGER := 0;
	v_key TEXT;
BEGIN
	IF jsonb_typeof(p_updates) <> 'array' THEN
		RAISE EXCEPTION 'NAME_CASE_UPDATES_MUST_BE_AN_ARRAY';
	END IF;

	IF jsonb_array_length(p_updates) > 500 THEN
		RAISE EXCEPTION 'TOO_MANY_NAME_CASE_UPDATES';
	END IF;

	FOR v_update IN SELECT value FROM jsonb_array_elements(p_updates)
	LOOP
		IF jsonb_typeof(v_update) <> 'object' OR v_update->>'id' IS NULL THEN
			RAISE EXCEPTION 'INVALID_NAME_CASE_UPDATE';
		END IF;

		v_profile_id := (v_update->>'id')::UUID;

		FOREACH v_key IN ARRAY ARRAY[
			'genitive', 'dative', 'accusative', 'vocative', 'instrumental', 'locative'
		]
		LOOP
			IF v_update ? v_key
				AND jsonb_typeof(v_update->v_key) NOT IN ('string', 'null') THEN
				RAISE EXCEPTION 'INVALID_NAME_CASE_VALUE %', v_key;
			END IF;

			IF char_length(btrim(COALESCE(v_update->>v_key, ''))) > 100 THEN
				RAISE EXCEPTION 'NAME_CASE_VALUE_TOO_LONG %', v_key;
			END IF;
		END LOOP;

		UPDATE public.profiles
		SET name_genitive = NULLIF(btrim(v_update->>'genitive'), ''),
			name_dative = NULLIF(btrim(v_update->>'dative'), ''),
			name_accusative = NULLIF(btrim(v_update->>'accusative'), ''),
			name_vocative = NULLIF(btrim(v_update->>'vocative'), ''),
			name_instrumental = NULLIF(btrim(v_update->>'instrumental'), ''),
			name_locative = NULLIF(btrim(v_update->>'locative'), ''),
			updated_at = now()
		WHERE id = v_profile_id;

		GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
		IF v_updated_rows <> 1 THEN
			RAISE EXCEPTION 'PROFILE_NOT_FOUND %', v_profile_id;
		END IF;

		v_total_updated := v_total_updated + 1;
	END LOOP;

	DELETE FROM public.rivalry_mission_snapshots
	WHERE player_id IS NOT NULL;

	RETURN v_total_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.update_profile_name_cases(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_profile_name_cases(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.update_profile_name_cases(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_profile_name_cases(JSONB) TO service_role;
