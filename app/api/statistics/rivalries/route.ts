import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
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

type SessionRelation = {
	completed_at: string | null;
	created_at: string;
};

type SinglesMatchRow = {
	id: string;
	player_ids: string[] | null;
	team1_score: number | null;
	team2_score: number | null;
	created_at: string;
	round_number: number | null;
	match_order: number | null;
	sessions: SessionRelation | SessionRelation[] | null;
};

function toNumber(value: number | string) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function getSession(row: SinglesMatchRow) {
	if (!row.sessions) return null;
	return Array.isArray(row.sessions) ? row.sessions[0] || null : row.sessions;
}

async function loadPlayerPairStatsFallback(
	adminClient: SupabaseClient,
	playerId: string,
) {
	const { data, error } = await adminClient
		.from("session_matches")
		.select(
			"id, player_ids, team1_score, team2_score, created_at, round_number, match_order, sessions!inner(completed_at, created_at)",
		)
		.eq("match_type", "singles")
		.eq("status", "completed")
		.eq("is_rated", true);

	if (error) {
		throw new Error(`Failed to fetch rivalry matches: ${error.message}`);
	}

	const opponentMatches = new Map<
		string,
		Array<{
			winnerId: string | null;
			playedAt: string;
			roundNumber: number;
			matchOrder: number;
			matchId: string;
		}>
	>();

	for (const match of (data || []) as SinglesMatchRow[]) {
		const playerIds = match.player_ids;
		if (!Array.isArray(playerIds) || playerIds.length < 2) continue;
		const playerIndex = playerIds.indexOf(playerId);
		if (playerIndex < 0) continue;

		const opponentId = playerIds[playerIndex === 0 ? 1 : 0];
		if (!opponentId) continue;
		const score1 = match.team1_score ?? 0;
		const score2 = match.team2_score ?? 0;
		const winnerId =
			score1 === score2 ? null : score1 > score2 ? playerIds[0] : playerIds[1];
		const session = getSession(match);
		const matches = opponentMatches.get(opponentId) || [];
		matches.push({
			winnerId,
			playedAt: session?.completed_at || session?.created_at || match.created_at,
			roundNumber: match.round_number ?? 0,
			matchOrder: match.match_order ?? 0,
			matchId: match.id,
		});
		opponentMatches.set(opponentId, matches);
	}

	const pairRows: PairStatsRow[] = [];
	for (const [opponentId, matches] of opponentMatches) {
		matches.sort((left, right) => {
			const timeDifference =
				new Date(right.playedAt).getTime() - new Date(left.playedAt).getTime();
			if (timeDifference !== 0) return timeDifference;
			if (right.roundNumber !== left.roundNumber) {
				return right.roundNumber - left.roundNumber;
			}
			if (right.matchOrder !== left.matchOrder) {
				return right.matchOrder - left.matchOrder;
			}
			return right.matchId.localeCompare(left.matchId);
		});

		const playerIsA = playerId.localeCompare(opponentId) <= 0;
		const playerAId = playerIsA ? playerId : opponentId;
		const playerBId = playerIsA ? opponentId : playerId;
		const latestWinnerId = matches[0]?.winnerId || null;
		let currentStreak = 0;
		if (latestWinnerId) {
			for (const match of matches) {
				if (match.winnerId !== latestWinnerId) break;
				currentStreak += 1;
			}
		}

		pairRows.push({
			player_a_id: playerAId,
			player_b_id: playerBId,
			total_matches: matches.length,
			player_a_wins: matches.filter((match) => match.winnerId === playerAId).length,
			player_b_wins: matches.filter((match) => match.winnerId === playerBId).length,
			draws: matches.filter((match) => match.winnerId === null).length,
			last_played_at: matches[0]?.playedAt || null,
			latest_winner_id: latestWinnerId,
			current_streak: currentStreak,
		});
	}

	return pairRows;
}

async function loadPlayerPairStats(
	adminClient: SupabaseClient,
	playerId: string,
) {
	const { data, error } = await adminClient.rpc("get_rivalry_pair_stats", {
		recent_session_limit: 4,
	});

	if (!error) {
		return ((data || []) as PairStatsRow[]).filter(
			(row) => row.player_a_id === playerId || row.player_b_id === playerId,
		);
	}

	if (error.code === "PGRST202" || error.code === "42883") {
		return loadPlayerPairStatsFallback(adminClient, playerId);
	}

	throw new Error(`Failed to fetch rivalry statistics: ${error.message}`);
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

		const playerId = authResult.userId;
		const adminClient = createAdminClient();
		const pairRows = await loadPlayerPairStats(adminClient, playerId);
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
