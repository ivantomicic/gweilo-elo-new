import { supabase } from "@/lib/supabase/client";

/**
 * Get current user's role from Supabase auth
 * 
 * Role is stored in user_metadata.role and defaults to "user" if not set.
 * This is the ONLY source of truth for user roles - never trust client-side flags.
 * 
 * Returns:
 * - "admin" | "user" | null (null if not authenticated)
 * 
 * Security note: This reads from the JWT token which is verified by Supabase.
 * The role cannot be spoofed on the client because it's part of the signed token.
 */
export async function getUserRole(): Promise<"admin" | "user" | null> {
	const {
		data: { session },
	} = await supabase.auth.getSession();

	if (!session?.user) {
		return null;
	}

	// Role is stored in user_metadata.role
	// Default to "user" if not set (enforced server-side via trigger)
	const role = session.user.user_metadata?.role || "user";

	// Validate role value (security: only allow known roles)
	if (role === "admin") {
		return "admin";
	}

	// Default to "user" for any other value (including undefined/null)
	return "user";
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

