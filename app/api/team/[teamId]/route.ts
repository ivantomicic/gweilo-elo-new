import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, verifyUser } from "@/lib/supabase/admin";

type DoubleTeamRecord = {
	id: string;
	player_1_id: string;
	player_2_id: string;
};

type ProfileRecord = {
	id: string;
	display_name: string | null;
	avatar_url: string | null;
};

type DoubleTeamRatingRecord = {
	team_id: string;
	matches_played: number | null;
	wins: number | null;
	losses: number | null;
	draws: number | null;
	sets_won: number | null;
	sets_lost: number | null;
	elo: number | string | null;
};

function toNumber(value: unknown, fallback = 0): number {
	if (typeof value === "number") {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	}

	return fallback;
}

export async function GET(
	request: NextRequest,
	{ params }: { params: { teamId: string } },
) {
	try {
		const authHeader = request.headers.get("authorization");
		const user = await verifyUser(authHeader);

		if (!user) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 },
			);
		}

		const adminClient = createAdminClient();
		const teamId = params.teamId;

		const { data: team, error: teamError } = await adminClient
			.from("double_teams")
			.select("id, player_1_id, player_2_id")
			.eq("id", teamId)
			.single<DoubleTeamRecord>();

		if (teamError || !team) {
			console.error("Error fetching double team:", teamError);
			return NextResponse.json({ error: "Team not found" }, { status: 404 });
		}

		const [{ data: profiles, error: profilesError }, { data: rating, error: ratingError }] =
			await Promise.all([
				adminClient
					.from("profiles")
					.select("id, display_name, avatar_url")
					.in("id", [team.player_1_id, team.player_2_id]),
				adminClient
					.from("double_team_ratings")
					.select(
						"team_id, matches_played, wins, losses, draws, sets_won, sets_lost, elo",
					)
					.eq("team_id", teamId)
					.maybeSingle<DoubleTeamRatingRecord>(),
			]);

		if (profilesError) {
			console.error("Error fetching team profiles:", profilesError);
			return NextResponse.json(
				{ error: "Failed to fetch team" },
				{ status: 500 },
			);
		}

		if (ratingError) {
			console.error("Error fetching team rating:", ratingError);
			return NextResponse.json(
				{ error: "Failed to fetch team" },
				{ status: 500 },
			);
		}

		const profilesMap = new Map(
			(profiles || []).map((profile: ProfileRecord) => [
				profile.id,
				{
					display_name: profile.display_name || "User",
					avatar: profile.avatar_url || null,
				},
			]),
		);

		const player1 = profilesMap.get(team.player_1_id);
		const player2 = profilesMap.get(team.player_2_id);
		const displayName = `${player1?.display_name || "User"} & ${player2?.display_name || "User"}`;

		return NextResponse.json({
			id: team.id,
			display_name: displayName,
			player1: {
				id: team.player_1_id,
				display_name: player1?.display_name || "User",
				avatar: player1?.avatar || null,
			},
			player2: {
				id: team.player_2_id,
				display_name: player2?.display_name || "User",
				avatar: player2?.avatar || null,
			},
			matches_played: rating?.matches_played ?? 0,
			wins: rating?.wins ?? 0,
			losses: rating?.losses ?? 0,
			draws: rating?.draws ?? 0,
			sets_won: rating?.sets_won ?? 0,
			sets_lost: rating?.sets_lost ?? 0,
			elo: toNumber(rating?.elo, 1500),
		});
	} catch (error) {
		console.error("Unexpected error in GET /api/team/[teamId]:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
