import { getSessionSafely } from "@/lib/supabase/client";
import { getUserRoleFromAuthUser, type UserRole } from "./roles";

export type { UserRole } from "./roles";

/**
 * Get current user's role from Supabase auth
 *
 * Role is stored in app_metadata.role and defaults to "user" if not set.
 * This is the client-side view of the server-issued auth claims.
 *
 * Returns:
 * - "admin" | "mod" | "user" | null (null if not authenticated)
 *
 * Security note: This reads from the signed JWT claims managed by Supabase Auth.
 */
export async function getUserRole(): Promise<UserRole | null> {
	const session = await getSessionSafely();

	if (!session?.user) {
		return null;
	}

	return getUserRoleFromAuthUser(session.user);
}

/**
 * Check if current user is an admin
 *
 * Convenience function for role checks.
 */
export async function isAdmin(): Promise<boolean> {
	const role = await getUserRole();
	return role === "admin";
}

/**
 * Check if current user is a mod or admin
 *
 * Mods can start sessions and record results.
 * Admins have all mod permissions plus full admin access.
 */
export async function isModOrAdmin(): Promise<boolean> {
	const role = await getUserRole();
	return role === "admin" || role === "mod";
}
