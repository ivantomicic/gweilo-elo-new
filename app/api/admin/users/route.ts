import { NextRequest, NextResponse } from "next/server";
import {
	createAdminClient,
	listAllAuthUsers,
	verifyModOrAdmin,
} from "@/lib/supabase/admin";
import { getManagedRoleFromAuthUser } from "@/lib/auth/roles";
import { getProviderAvatarFromMetadata } from "@/lib/profile-avatar";
import { getAuthToken } from "../../_utils/auth";
import { parseSessionsPerWeek } from "@/lib/no-shows/sessions-per-week";

/**
 * GET /api/admin/users
 *
 * Fetch all users (admin and mod)
 *
 * Security:
 * - Verifies admin or mod role via JWT token
 * - Uses service role key server-side (never exposed to client)
 * - Returns user list with: id, email, user_metadata (name, avatar_url), app_metadata.role
 * - Merges admin-managed sessions_per_week from player_schedule_settings
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

		const [users, { data: scheduleSettings, error: scheduleSettingsError }] =
			await Promise.all([
				listAllAuthUsers(adminClient),
				adminClient
					.from("player_schedule_settings")
					.select("user_id, sessions_per_week"),
			]);

		if (scheduleSettingsError) {
			console.error(
				"Error fetching player schedule settings:",
				scheduleSettingsError,
			);
			return NextResponse.json(
				{ error: "Failed to fetch player schedule settings" },
				{ status: 500 },
			);
		}

		const sessionsPerWeekByUserId = new Map(
			(scheduleSettings || []).map((setting) => [
				setting.user_id,
				parseSessionsPerWeek(setting.sessions_per_week),
			]),
		);
		const userIds = users.map((user) => user.id);
		const { data: profiles, error: profilesError } = await adminClient
			.from("profiles")
			.select("id, display_name, avatar_url")
			.in("id", userIds);

		if (profilesError) {
			console.error("Error fetching profiles:", profilesError);
			return NextResponse.json(
				{ error: "Failed to fetch profiles" },
				{ status: 500 },
			);
		}

		const profilesByUserId = new Map(
			(profiles || []).map((profile) => [profile.id, profile]),
		);

		// Format user data for frontend
		const formattedUsers = users
			.map((user) => {
				const role = getManagedRoleFromAuthUser(user);
				const profile = profilesByUserId.get(user.id);
				return {
					id: user.id,
					email: user.email || "",
					name:
						profile?.display_name ||
						user.user_metadata?.display_name ||
						user.user_metadata?.name ||
						user.user_metadata?.full_name ||
						user.email?.split("@")[0] ||
						"User",
					avatar:
						profile?.avatar_url ||
						getProviderAvatarFromMetadata(user.user_metadata) ||
						null,
					sessionsPerWeek:
						sessionsPerWeekByUserId.get(user.id) ?? null,
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
