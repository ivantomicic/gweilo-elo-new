import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, verifyModOrAdmin } from "@/lib/supabase/admin";
import { getAuthToken } from "../../_utils/auth";

/**
 * GET /api/admin/users
 *
 * Fetch all users (admin and mod)
 *
 * Security:
 * - Verifies admin or mod role via JWT token
 * - Uses service role key server-side (never exposed to client)
 * - Returns user list with: id, email, user_metadata (name, avatar_url, role)
 *
 * Supabase Approach:
 * - Uses Admin API (service role) to list all users
 * - Client-side Supabase cannot list users directly (security restriction)
 * - This API route acts as a secure proxy
 *
 * Note: Mods can read users (for session creation) but cannot modify them
 */
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const excludeGuests = searchParams.get("excludeGuests") === "true";

		// Verify admin or mod access
		const token = getAuthToken(request);
		const authHeader = token ? `Bearer ${token}` : null;
		const userId = await verifyModOrAdmin(authHeader);

		if (!userId) {
			return NextResponse.json(
				{ error: "Unauthorized. Admin or mod access required." },
				{ status: 401 },
			);
		}

		// Create admin client to fetch all users
		const adminClient = createAdminClient();

		// List all users using Admin API
		const {
			data: { users },
			error,
		} = await adminClient.auth.admin.listUsers();

		if (error) {
			console.error("Error fetching users:", error);
			return NextResponse.json(
				{ error: "Failed to fetch users" },
				{ status: 500 },
			);
		}

		// Format user data for frontend
		const formattedUsers = users
			.map((user) => {
				const role =
					typeof user.user_metadata?.role === "string"
						? user.user_metadata.role
						: "user";
				return {
					id: user.id,
					email: user.email || "",
					name:
						user.user_metadata?.display_name ||
						user.user_metadata?.name ||
						user.user_metadata?.full_name ||
						user.email?.split("@")[0] ||
						"User",
					avatar: user.user_metadata?.avatar_url || null,
					role,
					createdAt: user.created_at,
				};
			})
			.filter((user) => !excludeGuests || user.role !== "guest");

		return NextResponse.json({ users: formattedUsers });
	} catch (error) {
		console.error("Unexpected error in GET /api/admin/users:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
