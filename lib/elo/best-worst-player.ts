import { createAdminClient } from "@/lib/supabase/admin";
import {
	aggregateBestWorstEloTotals,
	type MatchEloHistoryDelta,
} from "@/lib/elo/best-worst";

type AdminClient = ReturnType<typeof createAdminClient>;

export type BestWorstPlayerResult = {
	best_player_id: string | null;
	best_player_display_name: string | null;
	best_player_delta: number | null;
	worst_player_id: string | null;
	worst_player_display_name: string | null;
	worst_player_delta: number | null;
};

/**
 * Calculate best and worst player of a session based on total Elo delta.
 *
 * Definition:
 * - Best player = player with highest SINGLES Elo change in that session
 * - Worst player = player with lowest SINGLES Elo change in that session
 * - Singles Elo change = sum of committed match_elo_history deltas
 * - Only includes players who played singles matches (doubles-only players excluded)
 *
 * This matches the session summary's authoritative calculation.
 *
 * Edge cases:
 * - If no completed matches → returns nulls
 * - If tie → picks deterministically (lowest UUID)
 * - Only calculates for completed sessions
 *
 * @param sessionId - UUID of the session
 * @returns Best/worst player data, or nulls if unable to calculate
 */
export async function calculateBestWorstPlayer(
	sessionId: string,
	adminClient: AdminClient = createAdminClient(),
): Promise<BestWorstPlayerResult> {
	const { data: singlesMatches, error: matchesError } = await adminClient
		.from("session_matches")
		.select("id, player_ids")
		.eq("session_id", sessionId)
		.eq("match_type", "singles")
		.eq("status", "completed");

	if (matchesError) {
		throw new Error(
			`Failed to load completed singles for session ${sessionId}: ${matchesError.message}`,
		);
	}

	if (!singlesMatches || singlesMatches.length === 0) return getNullResult();

	const singlesPlayerIds = new Set<string>();
	for (const match of singlesMatches) {
		for (const playerId of ((match.player_ids as string[]) || []).slice(0, 2)) {
			singlesPlayerIds.add(playerId);
		}
	}
	if (singlesPlayerIds.size === 0) return getNullResult();

	const matchIds = singlesMatches.map((match) => match.id);
	const { data: history, error: historyError } = await adminClient
		.from("match_elo_history")
		.select(
			"player1_id, player1_elo_delta, player2_id, player2_elo_delta",
		)
		.in("match_id", matchIds);

	if (historyError) {
		throw new Error(
			`Failed to load Elo history for session ${sessionId}: ${historyError.message}`,
		);
	}

	const { best, worst } = aggregateBestWorstEloTotals(
		singlesPlayerIds,
		(history || []) as MatchEloHistoryDelta[],
	);
	if (!best || !worst) return getNullResult();

	const { data: profiles, error: profilesError } = await adminClient
		.from("profiles")
		.select("id, display_name")
		.in("id", Array.from(new Set([best.playerId, worst.playerId])));

	if (profilesError) {
		throw new Error(
			`Failed to load best/worst profiles for session ${sessionId}: ${profilesError.message}`,
		);
	}

	const names = new Map(
		(profiles || []).map((profile) => [profile.id, profile.display_name]),
	);
	return {
		best_player_id: best.playerId,
		best_player_display_name: names.get(best.playerId) || null,
		best_player_delta: best.eloChange,
		worst_player_id: worst.playerId,
		worst_player_display_name: names.get(worst.playerId) || null,
		worst_player_delta: worst.eloChange,
	};
}

export async function refreshSessionBestWorstPlayer(
	sessionId: string,
	adminClient: AdminClient = createAdminClient(),
): Promise<BestWorstPlayerResult> {
	const result = await calculateBestWorstPlayer(sessionId, adminClient);
	const { error } = await adminClient
		.from("sessions")
		.update(result)
		.eq("id", sessionId);

	if (error) {
		throw new Error(
			`Failed to cache best/worst player for session ${sessionId}: ${error.message}`,
		);
	}

	return result;
}

function getNullResult(): BestWorstPlayerResult {
	return {
		best_player_id: null,
		best_player_display_name: null,
		best_player_delta: null,
		worst_player_id: null,
		worst_player_display_name: null,
		worst_player_delta: null,
	};
}
