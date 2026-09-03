import { createAuthenticatedFetch } from "@/lib/auth/authenticated-fetch-core";
import { supabase } from "@/lib/supabase/client";

export { AuthSessionUnavailableError } from "@/lib/auth/authenticated-fetch-core";

export const authenticatedFetch = createAuthenticatedFetch(supabase.auth);
