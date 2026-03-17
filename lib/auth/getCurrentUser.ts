import { supabase } from "@/lib/supabase/client";
import { getUserRoleFromAuthUser, type UserRole } from "./roles";

/**
 * Get current user from Supabase auth session
 *
 * Returns user data formatted for sidebar display:
 * - name: from user_metadata.display_name (custom) > name (OAuth) > full_name > email fallback
 * - email: from user.email
 * - avatar: from user_metadata.avatar_url or placeholder fallback
 * - role: from app_metadata.role (defaults to "user")
 *
 * Note: display_name is used to avoid OAuth provider overwrites of custom names
 */
export async function getCurrentUser() {
	const {
		data: { session },
	} = await supabase.auth.getSession();

	if (!session?.user) {
		return null;
	}

	const user = session.user;
	// Prefer display_name (custom) over name (OAuth-provided) to avoid OAuth overwrites
	const name =
		user.user_metadata?.display_name ||
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

	const validRole: UserRole = getUserRoleFromAuthUser(user);

	return {
		name,
		email,
		avatar,
		role: validRole,
	};
}
