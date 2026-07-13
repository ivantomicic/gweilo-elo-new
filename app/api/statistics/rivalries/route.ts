import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, verifyUser } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
	"Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
	Pragma: "no-cache",
};

type PairStatsRow = {
	player_a_id: string;
	player_b_id: string;
	total_matches: number | string;
	player_a_wins: number | string;
	player_b_wins: number | string;
	draws: number | string;
	last_played_at: string | null;
	latest_winner_id: string | null;
	current_streak: number | string;
};

type ProfileRow = {
	id: string;
	display_name: string | null;
	avatar_url: string | null;
};

function toNumber(value: number | string) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: NextRequest) {
	try {
		const authResult = await verifyUser(request.headers.get("authorization"));
		if (!authResult) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401, headers: NO_STORE_HEADERS },
			);
		}

		const playerId = new URL(request.url).searchParams.get("playerId");
		if (!playerId) {
			return NextResponse.json(
				{ error: "playerId query parameter is required" },
				{ status: 400, headers: NO_STORE_HEADERS },
			);
		}

		const adminClient = createAdminClient();
		const { data, error } = await adminClient.rpc("get_rivalry_pair_stats", {
			recent_session_limit: 4,
		});

		if (error) {
			throw new Error(`Failed to fetch rivalry statistics: ${error.message}`);
		}

		const pairRows = ((data || []) as PairStatsRow[]).filter(
			(row) => row.player_a_id === playerId || row.player_b_id === playerId,
		);
		const profileIds = Array.from(
			new Set([
				playerId,
				...pairRows.map((row) =>
					row.player_a_id === playerId ? row.player_b_id : row.player_a_id,
				),
			]),
		);
		const { data: profiles, error: profilesError } = await adminClient
			.from("profiles")
			.select("id, display_name, avatar_url")
			.in("id", profileIds);

		if (profilesError) {
			throw new Error(`Failed to fetch rivalry players: ${profilesError.message}`);
		}

		const profileMap = new Map(
			((profiles || []) as ProfileRow[]).map((profile) => [profile.id, profile]),
		);
		const playerProfile = profileMap.get(playerId);
		if (!playerProfile) {
			return NextResponse.json(
				{ error: "Player not found" },
				{ status: 404, headers: NO_STORE_HEADERS },
			);
		}

		const rivalries = pairRows
			.map((row) => {
				const playerIsA = row.player_a_id === playerId;
				const opponentId = playerIsA ? row.player_b_id : row.player_a_id;
				const opponent = profileMap.get(opponentId);
				const wins = toNumber(playerIsA ? row.player_a_wins : row.player_b_wins);
				const losses = toNumber(playerIsA ? row.player_b_wins : row.player_a_wins);
				const draws = toNumber(row.draws);
				const totalMatches = toNumber(row.total_matches);
				const currentStreak = toNumber(row.current_streak);

				return {
					opponentId,
					opponentName: opponent?.display_name || "User",
					opponentAvatar: opponent?.avatar_url || null,
					totalMatches,
					wins,
					losses,
					draws,
					winRate: totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0,
					lastPlayedAt: row.last_played_at,
					streak:
						currentStreak === 0 || !row.latest_winner_id
							? null
							: {
								result: row.latest_winner_id === playerId ? "win" : "loss",
								count: currentStreak,
							},
				};
			})
			.sort(
				(left, right) =>
					right.wins - left.wins ||
					right.totalMatches - left.totalMatches ||
					left.opponentName.localeCompare(right.opponentName, "sr-Latn-RS"),
			);

		return NextResponse.json(
			{
				player: {
					id: playerId,
					displayName: playerProfile.display_name || "User",
					avatar: playerProfile.avatar_url || null,
				},
				rivalries,
			},
			{ headers: NO_STORE_HEADERS },
		);
	} catch (error) {
		console.error("Unexpected error in GET /api/statistics/rivalries:", error);
		return NextResponse.json(
			{ error: "Failed to load rivalry statistics" },
			{ status: 500, headers: NO_STORE_HEADERS },
		);
	}
}
