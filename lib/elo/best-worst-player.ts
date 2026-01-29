import { createAdminClient } from "@/lib/supabase/admin";
import {
	getSessionBaseline,
	replaySessionMatches,
} from "@/lib/elo/session-baseline";

type BestWorstPlayerResult = {
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
 * - Singles Elo change = (singles_elo_after_session - singles_elo_before_session)
 * - Only includes players who played singles matches (doubles-only players excluded)
 *
 * This matches the session summary calculation method exactly (baseline + replay).
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
	sessionId: string
): Promise<BestWorstPlayerResult> {
	const adminClient = createAdminClient();

	try {
		// Step 1: Get all completed singles matches for this session
		const { data: singlesMatches, error: matchesError } =
			await adminClient
				.from("session_matches")
				.select("id, match_type, player_ids")
				.eq("session_id", sessionId)
				.eq("match_type", "singles")
				.eq("status", "completed");

		if (matchesError) {
			console.error("Error fetching singles matches:", matchesError);
			return getNullResult();
		}

		// If no completed singles matches, return nulls
		if (!singlesMatches || singlesMatches.length === 0) {
			return getNullResult();
		}

		// Step 2: Collect only players who played singles matches
		const singlesPlayerIds = new Set<string>();
		for (const match of singlesMatches) {
			const playerIds = (match.player_ids as string[]) || [];
			if (playerIds.length >= 2) {
				singlesPlayerIds.add(playerIds[0]);
				singlesPlayerIds.add(playerIds[1]);
			}
		}

		if (singlesPlayerIds.size === 0) {
			return getNullResult();
		}

		// Step 3: Calculate singles Elo change (elo_after - elo_before)
		const singlesBaseline = await getSessionBaseline(sessionId);
		const singlesPostSession = await replaySessionMatches(
			sessionId,
			singlesBaseline
		);

		// Step 4: Calculate singles Elo change per player
		const playerEloChanges = new Map<string, number>();

		for (const playerId of singlesPlayerIds) {
			const baseline = singlesBaseline.get(playerId);
			const eloBefore = baseline?.elo ?? 1500;

			const postSession = singlesPostSession.get(playerId);
			const eloAfter = postSession?.elo ?? eloBefore;

			const singlesEloChange = eloAfter - eloBefore;
			playerEloChanges.set(playerId, singlesEloChange);
		}

		// Step 5: Find best and worst players
		if (playerEloChanges.size === 0) {
			return getNullResult();
		}

		// Convert to array and sort
		const playerChangeArray = Array.from(playerEloChanges.entries()).map(
			([player_id, elo_change]) => ({ player_id, elo_change })
		);

		// Sort by elo_change DESC, then by player_id ASC (for deterministic tie-breaking)
		playerChangeArray.sort((a, b) => {
			if (b.elo_change !== a.elo_change) {
				return b.elo_change - a.elo_change; // DESC by elo_change
			}
			return a.player_id.localeCompare(b.player_id); // ASC by UUID (deterministic)
		});

		const best = playerChangeArray[0];
		const worst = playerChangeArray[playerChangeArray.length - 1];

		// Step 6: Fetch display names for best and worst players
		const playerIdsToFetch = new Set<string>();
		if (best.player_id) playerIdsToFetch.add(best.player_id);
		if (worst.player_id) playerIdsToFetch.add(worst.player_id);

		const usersMap = new Map<string, string>();

		if (playerIdsToFetch.size > 0) {
			const { data: profiles, error: profilesError } = await adminClient
				.from("profiles")
				.select("id, display_name")
				.in("id", Array.from(playerIdsToFetch));

			if (profilesError) {
				console.error("Error fetching profiles:", profilesError);
				// Non-fatal: continue without display names
			} else if (profiles) {
				profiles.forEach((profile) => {
					usersMap.set(profile.id, profile.display_name || "User");
				});
			}
		}

		return {
			best_player_id: best.player_id,
			best_player_display_name: usersMap.get(best.player_id) || null,
			best_player_delta: best.elo_change,
			worst_player_id: worst.player_id,
			worst_player_display_name: usersMap.get(worst.player_id) || null,
			worst_player_delta: worst.elo_change,
		};
	} catch (error) {
		console.error(
			`Error calculating best/worst player for session ${sessionId}:`,
			error
		);
		return getNullResult();
	}
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
