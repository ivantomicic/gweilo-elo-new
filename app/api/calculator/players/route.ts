import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getManagedRoleFromAuthUser } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthToken } from "@/app/api/_utils/auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

export async function GET(request: NextRequest) {
	try {
		const token = getAuthToken(request);
		if (!token) {
			return NextResponse.json(
				{ error: "Unauthorized." },
				{ status: 401 },
			);
		}

		const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
			global: {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		});

		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser(token);

		if (userError || !user) {
			return NextResponse.json(
				{ error: "Unauthorized." },
				{ status: 401 },
			);
		}

		const { data: ratings, error: ratingsError } = await supabase
			.from("player_ratings")
			.select("player_id, elo, matches_played");

		if (ratingsError) {
			console.error(
				"Error fetching calculator player ratings:",
				ratingsError,
			);
			return NextResponse.json(
				{ error: "Failed to fetch player ratings" },
				{ status: 500 },
			);
		}

		const playerIds = (ratings || []).map((rating) => rating.player_id);

		if (playerIds.length === 0) {
			return NextResponse.json({ players: [] });
		}

		const adminClient = createAdminClient();
		const [{ data: profiles, error: profilesError }, authUsersResults] =
			await Promise.all([
				supabase
					.from("profiles")
					.select("id, display_name, avatar_url")
					.in("id", playerIds),
				Promise.all(
					playerIds.map(async (playerId) => {
						const { data, error } =
							await adminClient.auth.admin.getUserById(playerId);
						if (error) {
							throw new Error(
								`Failed to fetch auth user ${playerId}: ${error.message}`,
							);
						}
						return data.user;
					}),
				),
			]);

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

		const ratingsByPlayerId = new Map(
			(ratings || []).map((rating) => [
				rating.player_id,
				{
					elo:
						typeof rating.elo === "string"
							? parseFloat(rating.elo)
							: Number(rating.elo),
					matchesPlayed: rating.matches_played ?? 0,
				},
			]),
		);
		const visiblePlayerIds = new Set(
			(authUsersResults || [])
				.filter(
					(authUser) =>
						getManagedRoleFromAuthUser(authUser) !== "guest",
				)
				.map((authUser) => authUser.id),
		);

		const players = (profiles || [])
			.filter((profile) => visiblePlayerIds.has(profile.id))
			.map((profile) => {
				const rating = ratingsByPlayerId.get(profile.id);
				return {
					id: profile.id,
					name: profile.display_name || "User",
					avatar: profile.avatar_url || null,
					elo: rating?.elo ?? 1500,
					matchesPlayed: rating?.matchesPlayed ?? 0,
				};
			})
			.sort((a, b) => b.elo - a.elo);

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
