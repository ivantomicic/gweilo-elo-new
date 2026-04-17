import { getSessionSafely, supabase } from "@/lib/supabase/client";
import {
	getEffectiveAvatar,
	getProviderAvatarFromMetadata,
} from "@/lib/profile-avatar";
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
	const session = await getSessionSafely();

	if (!session?.user) {
		return null;
	}

	const user = session.user;
	const { data: profile } = await supabase
		.from("profiles")
		.select("display_name, avatar_url, provider_avatar_url")
		.eq("id", user.id)
		.maybeSingle();

	// Prefer display_name (custom) over name (OAuth-provided) to avoid OAuth overwrites
	const name =
		profile?.display_name ||
		user.user_metadata?.display_name ||
		user.user_metadata?.name ||
		user.user_metadata?.full_name ||
		user.email?.split("@")[0] ||
		"User";
	const email = user.email || "";
	const avatar = getEffectiveAvatar(
		profile?.avatar_url,
		profile?.provider_avatar_url || getProviderAvatarFromMetadata(user.user_metadata)
	);

	const validRole: UserRole = getUserRoleFromAuthUser(user);

	return {
		name,
		email,
		avatar,
		role: validRole,
	};
}
