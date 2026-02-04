import { createClient } from "@supabase/supabase-js";

export type UserRole = "admin" | "mod" | "user";

/**
 * Create Supabase admin client with service role key
 *
 * WARNING: This uses the service role key which has full admin access.
 * NEVER expose this to the client. Only use in server-side code (API routes, server components).
 *
 * The service role key bypasses Row Level Security (RLS) and has full access to all data.
 */
export function createAdminClient() {
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !supabaseServiceRoleKey) {
		throw new Error("Missing Supabase admin environment variables");
	}

	return createClient(supabaseUrl, supabaseServiceRoleKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});
}

/**
 * Verify user and get their role
 *
 * @param authHeader - The Authorization header from the request (Bearer token)
 * @returns Object with userId and role, or null if not authenticated
 */
export async function verifyUser(
	authHeader: string | null,
): Promise<{ userId: string; role: UserRole } | null> {
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		return null;
	}

	const token = authHeader.replace("Bearer ", "");
	const adminClient = createAdminClient();

	// Verify the token and get user
	const {
		data: { user },
		error,
	} = await adminClient.auth.getUser(token);

	if (error || !user) {
		return null;
	}

	const roleFromValue = (value: unknown): UserRole | null => {
		if (value === "admin") return "admin";
		if (value === "mod") return "mod";
		return null;
	};

	const roleFromArray = (metadata?: Record<string, unknown>): UserRole | null => {
		const roles = metadata?.roles;
		if (Array.isArray(roles)) {
			if (roles.includes("admin")) return "admin";
			if (roles.includes("mod")) return "mod";
		}
		return null;
	};

	const role =
		roleFromValue(user.user_metadata?.role) ||
		roleFromValue(user.app_metadata?.role) ||
		roleFromArray(user.user_metadata) ||
		roleFromArray(user.app_metadata) ||
		"user";

	let validRole: UserRole = "user";
	if (role === "admin") {
		validRole = "admin";
	} else if (role === "mod") {
		validRole = "mod";
	}

	return { userId: user.id, role: validRole };
}

/**
 * Verify that the requesting user is an admin
 *
 * This function reads the user's role from their JWT token.
 * It should be called in API routes to verify admin access.
 *
 * @param authHeader - The Authorization header from the request (Bearer token)
 * @returns The user ID if admin, null otherwise
 */
export async function verifyAdmin(
	authHeader: string | null,
): Promise<string | null> {
	const result = await verifyUser(authHeader);
	if (!result || result.role !== "admin") {
		return null;
	}
	return result.userId;
}

/**
 * Verify that the requesting user is a mod or admin
 *
 * Mods can start sessions and record results.
 * Admins have all mod permissions plus full admin access.
 *
 * @param authHeader - The Authorization header from the request (Bearer token)
 * @returns The user ID if mod or admin, null otherwise
 */
export async function verifyModOrAdmin(
	authHeader: string | null,
): Promise<string | null> {
	const result = await verifyUser(authHeader);
	if (!result || (result.role !== "admin" && result.role !== "mod")) {
		return null;
	}
	return result.userId;
}
