import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, verifyAdmin } from "@/lib/supabase/admin";
import { getManagedRoleFromAuthUser } from "@/lib/auth/roles";
import {
	SESSIONS_PER_WEEK_METADATA_KEY,
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
 * - Sessions per week → updates user_metadata.sessions_per_week
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

		// Build update payload
		const updateData: {
			user_metadata?: Record<string, any>;
			app_metadata?: Record<string, any>;
			email?: string;
		} = {};

		// Get current user once so metadata updates preserve unrelated keys.
		const needsMetadataUpdate =
			name !== undefined ||
			avatar !== undefined ||
			role !== undefined ||
			sessionsPerWeek !== undefined;
		let currentUser: Awaited<
			ReturnType<typeof adminClient.auth.admin.getUserById>
		>["data"]["user"] | null = null;

		if (needsMetadataUpdate) {
			// Get current user to preserve existing metadata
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

		// Update user_metadata if name or avatar provided
		if (
			(name !== undefined ||
				avatar !== undefined ||
				sessionsPerWeek !== undefined) &&
			currentUser
		) {
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

			if (sessionsPerWeek !== undefined) {
				updateData.user_metadata[SESSIONS_PER_WEEK_METADATA_KEY] =
					parsedSessionsPerWeek;
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

		// Update user via Admin API
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

		// Format response
		const updatedUser = {
			id: data.user.id,
			email: data.user.email || "",
			name:
				data.user.user_metadata?.display_name ||
				data.user.user_metadata?.name ||
				data.user.user_metadata?.full_name ||
				data.user.email?.split("@")[0] ||
				"User",
			avatar: data.user.user_metadata?.avatar_url || null,
			sessionsPerWeek: parseSessionsPerWeek(
				data.user.user_metadata?.[SESSIONS_PER_WEEK_METADATA_KEY],
			),
			role: getManagedRoleFromAuthUser(data.user),
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
