import { supabase } from "@/lib/supabase/client";

/**
 * Get current user from Supabase auth session
 * 
 * Returns user data formatted for sidebar display:
 * - name: from user_metadata.name or email fallback
 * - email: from user.email
 * - avatar: from user_metadata.avatar_url or placeholder fallback
 */
export async function getCurrentUser() {
	const {
		data: { session },
	} = await supabase.auth.getSession();

	if (!session?.user) {
		return null;
	}

	const user = session.user;
	const name =
		user.user_metadata?.name ||
		user.user_metadata?.full_name ||
		user.email?.split("@")[0] ||
		"User";
	const email = user.email || "";
	// Use avatar from metadata, or Google avatar, or null (UI will handle placeholder)
	const avatar =
		user.user_metadata?.avatar_url ||
		user.user_metadata?.avatar_url_google ||
		null;

	return {
		name,
		email,
		avatar,
	};
}

