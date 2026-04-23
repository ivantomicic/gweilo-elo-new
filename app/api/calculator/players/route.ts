import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, listAllAuthUsers, verifyUser } from "@/lib/supabase/admin";
import { getManagedRoleFromAuthUser } from "@/lib/auth/roles";
import { getProviderAvatarFromMetadata } from "@/lib/profile-avatar";
import { getAuthToken } from "@/app/api/_utils/auth";

export async function GET(request: NextRequest) {
	try {
		const token = getAuthToken(request);
		const authHeader = token ? `Bearer ${token}` : null;
		const authResult = await verifyUser(authHeader);

		if (!authResult) {
			return NextResponse.json(
				{ error: "Unauthorized." },
				{ status: 401 },
			);
		}

		const adminClient = createAdminClient();
		const users = await listAllAuthUsers(adminClient);
		const nonGuestUsers = users.filter(
			(user) => getManagedRoleFromAuthUser(user) !== "guest",
		);
		const userIds = nonGuestUsers.map((user) => user.id);

		if (userIds.length === 0) {
			return NextResponse.json({ players: [] });
		}

		const { data: profiles, error: profilesError } = await adminClient
			.from("profiles")
			.select("id, display_name, avatar_url")
			.in("id", userIds);

		if (profilesError) {
			console.error(
				"Error fetching profiles for calculator players:",
				profilesError,
			);
			return NextResponse.json(
				{ error: "Failed to fetch players" },
				{ status: 500 },
			);
		}

		const profilesByUserId = new Map(
			(profiles || []).map((profile) => [profile.id, profile]),
		);

		const players = nonGuestUsers.map((user) => {
			const profile = profilesByUserId.get(user.id);
			return {
				id: user.id,
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
			};
		});

		return NextResponse.json({ players });
	} catch (error) {
		console.error(
			"Unexpected error in GET /api/calculator/players:",
			error,
		);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
