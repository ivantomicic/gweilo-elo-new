import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, verifyAdmin } from "@/lib/supabase/admin";
import { getManagedRoleFromAuthUser } from "@/lib/auth/roles";
import {
	type SessionsPerWeek,
	parseSessionsPerWeek,
} from "@/lib/no-shows/sessions-per-week";

const VALID_ROLES = ["user", "mod", "admin", "guest"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

/**
 * PATCH /api/admin/users/[userId]
 *
 * Update user data (admin-only)
 *
 * Security:
 * - Verifies admin role via JWT token
 * - Uses service role key server-side
 * - Can update: name, email, avatar_url, role, sessions_per_week
 *
 * Update Behavior:
 * - Display name → updates user_metadata.display_name
 * - Email → uses Supabase email update (requires confirmation)
 * - Avatar → updates user_metadata.avatar_url (assumes URL is already uploaded)
 * - Role → updates app_metadata.role (admin, mod, user, or guest)
 * - Sessions per week → updates public.player_schedule_settings
 *
 * Limitations:
 * - Email changes require confirmation (Supabase sends confirmation email)
 * - Avatar URL must be provided (upload should happen separately if needed)
 */
export async function PATCH(
	request: NextRequest,
	{ params }: { params: { userId: string } },
) {
	try {
		// Verify admin access
		const authHeader = request.headers.get("authorization");
		const adminUserId = await verifyAdmin(authHeader);

		if (!adminUserId) {
			return NextResponse.json(
				{ error: "Unauthorized. Admin access required." },
				{ status: 401 },
			);
		}

		const { userId } = params;
		const body = await request.json();
		const { name, email, avatar, role, sessionsPerWeek } = body;

		// Validate input
		if (
			!name &&
			!email &&
			avatar === undefined &&
			role === undefined &&
			sessionsPerWeek === undefined
		) {
			return NextResponse.json(
				{
					error: "At least one field (name, email, avatar, role, sessionsPerWeek) must be provided",
				},
				{ status: 400 },
			);
		}

		// Validate role if provided
		if (role !== undefined && !VALID_ROLES.includes(role)) {
			return NextResponse.json(
				{
					error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`,
				},
				{ status: 400 },
			);
		}

		const parsedSessionsPerWeek =
			sessionsPerWeek === undefined || sessionsPerWeek === null
				? sessionsPerWeek ?? null
				: parseSessionsPerWeek(sessionsPerWeek);

		if (
			sessionsPerWeek !== undefined &&
			sessionsPerWeek !== null &&
			parsedSessionsPerWeek === null
		) {
			return NextResponse.json(
				{
					error: "Invalid sessionsPerWeek. Must be null or an integer between 1 and 4.",
				},
				{ status: 400 },
			);
		}

		const adminClient = createAdminClient();
		const needsAuthMetadataUpdate =
			name !== undefined || avatar !== undefined || role !== undefined;
		const needsAuthUpdate = needsAuthMetadataUpdate || email !== undefined;

		let currentUser: Awaited<
			ReturnType<typeof adminClient.auth.admin.getUserById>
		>["data"]["user"] | null = null;

		if (needsAuthMetadataUpdate || !needsAuthUpdate) {
			const { data, error: currentUserError } =
				await adminClient.auth.admin.getUserById(userId);
			currentUser = data.user;

			if (currentUserError || !currentUser) {
				return NextResponse.json(
					{ error: currentUserError?.message || "User not found" },
					{ status: currentUserError ? 400 : 404 },
				);
			}
		}

		// Build update payload
		const updateData: {
			user_metadata?: Record<string, any>;
			app_metadata?: Record<string, any>;
			email?: string;
		} = {};

		// Update user_metadata if name or avatar provided
		if ((name !== undefined || avatar !== undefined) && currentUser) {
			updateData.user_metadata = {
				...currentUser.user_metadata,
			};

			if (name !== undefined) {
				// Use display_name to avoid OAuth provider overwrites
				updateData.user_metadata.display_name = name;
			}

			if (avatar !== undefined) {
				updateData.user_metadata.avatar_url = avatar || null;
			}
		}

		if (role !== undefined && currentUser) {
			updateData.app_metadata = {
				...currentUser.app_metadata,
				role: role as ValidRole,
			};
		}

		// Update email if provided
		if (email !== undefined) {
			updateData.email = email;
		}

		let updatedAuthUser = currentUser;

		if (needsAuthUpdate) {
			const { data, error } = await adminClient.auth.admin.updateUserById(
				userId,
				updateData,
			);

			if (error) {
				console.error("Error updating user:", error);
				return NextResponse.json(
					{ error: error.message || "Failed to update user" },
					{ status: 400 },
				);
			}

			updatedAuthUser = data.user;
		}

		if (sessionsPerWeek !== undefined) {
			const scheduleSettingsMutation =
				parsedSessionsPerWeek === null
					? adminClient
							.from("player_schedule_settings")
							.delete()
							.eq("user_id", userId)
					: adminClient.from("player_schedule_settings").upsert(
							{
								user_id: userId,
								sessions_per_week:
									parsedSessionsPerWeek as SessionsPerWeek,
							},
							{ onConflict: "user_id" },
						);

			const { error: scheduleSettingsError } =
				await scheduleSettingsMutation;

			if (scheduleSettingsError) {
				console.error(
					"Error updating player schedule settings:",
					scheduleSettingsError,
				);
				return NextResponse.json(
					{ error: "Failed to update player schedule settings" },
					{ status: 500 },
				);
			}
		}

		if (!updatedAuthUser) {
			const { data, error: userFetchError } =
				await adminClient.auth.admin.getUserById(userId);
			updatedAuthUser = data.user;

			if (userFetchError || !updatedAuthUser) {
				return NextResponse.json(
					{ error: userFetchError?.message || "User not found" },
					{ status: userFetchError ? 400 : 404 },
				);
			}
		}

		const {
			data: scheduleSettings,
			error: scheduleSettingsFetchError,
		} = await adminClient
			.from("player_schedule_settings")
			.select("sessions_per_week")
			.eq("user_id", userId)
			.maybeSingle();

		if (scheduleSettingsFetchError) {
			console.error(
				"Error fetching updated player schedule settings:",
				scheduleSettingsFetchError,
			);
			return NextResponse.json(
				{ error: "Failed to fetch updated player schedule settings" },
				{ status: 500 },
			);
		}

		const updatedUser = {
			id: updatedAuthUser.id,
			email: updatedAuthUser.email || "",
			name:
				updatedAuthUser.user_metadata?.display_name ||
				updatedAuthUser.user_metadata?.name ||
				updatedAuthUser.user_metadata?.full_name ||
				updatedAuthUser.email?.split("@")[0] ||
				"User",
			avatar: updatedAuthUser.user_metadata?.avatar_url || null,
			sessionsPerWeek: parseSessionsPerWeek(
				scheduleSettings?.sessions_per_week,
			),
			role: getManagedRoleFromAuthUser(updatedAuthUser),
		};

		return NextResponse.json({
			user: updatedUser,
			message: email
				? "User updated. Email confirmation sent to new address."
				: "User updated successfully.",
		});
	} catch (error) {
		console.error(
			"Unexpected error in PATCH /api/admin/users/[userId]:",
			error,
		);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
