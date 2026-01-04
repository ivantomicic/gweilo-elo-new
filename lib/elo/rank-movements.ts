import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Get the latest two completed sessions
 * @returns Array of [latestSessionId, previousSessionId] or [latestSessionId, null] if only one exists
 */
export async function getLatestTwoCompletedSessions(): Promise<
	[string | null, string | null]
> {
	const adminClient = createAdminClient();

	// Get latest two completed sessions, ordered by created_at DESC
	const { data: sessions, error } = await adminClient
		.from("sessions")
		.select("id, created_at")
		.eq("status", "completed")
		.order("created_at", { ascending: false })
		.limit(2);

	if (error || !sessions || sessions.length === 0) {
		return [null, null];
	}

	const latestSessionId = sessions[0]?.id || null;
	const previousSessionId = sessions[1]?.id || null;

	return [latestSessionId, previousSessionId];
}

/**
 * Get ranking snapshot from a completed session
 * For singles: returns Map of playerId -> rank (1-indexed)
 * Players are ranked by Elo from session_rating_snapshots
 */
export async function getRankingFromSession(
	sessionId: string,
	entityType: "player_singles" | "player_doubles" | "double_team"
): Promise<Map<string, number>> {
	const adminClient = createAdminClient();

	// Get all snapshots for this session and entity type
	const { data: snapshots, error } = await adminClient
		.from("session_rating_snapshots")
		.select("entity_id, elo")
		.eq("session_id", sessionId)
		.eq("entity_type", entityType);

	if (error) {
		console.error("[RANK] Error fetching snapshots:", error);
		return new Map();
	}

	if (!snapshots || snapshots.length === 0) {
		console.log("[RANK] No snapshots found for session:", {
			sessionId,
			entityType,
		});
		return new Map();
	}

	// Convert elo to number and sort by Elo (descending)
	const sortedSnapshots = snapshots
		.map((s) => ({
			entityId: s.entity_id as string,
			elo:
				typeof s.elo === "string" ? parseFloat(s.elo) : Number(s.elo),
		}))
		.sort((a, b) => b.elo - a.elo);

	// Create map of entityId -> rank (1-indexed)
	const rankingMap = new Map<string, number>();
	sortedSnapshots.forEach((snapshot, index) => {
		rankingMap.set(snapshot.entityId, index + 1);
	});

	console.log("[RANK] Rankings from session:", {
		sessionId,
		entityType,
		snapshotCount: snapshots.length,
		rankings: Array.from(rankingMap.entries()).slice(0, 5), // First 5 for debugging
	});

	return rankingMap;
}

/**
 * Compute rank movements for players/teams
 * Compares current rankings (from ratings tables) with previous session rankings (from snapshots)
 *
 * IMPORTANT: Snapshots are stored at the START of each session, which represents the state
 * AFTER the previous session completes. So to get rankings after Session N-1, we use
 * the snapshot from Session N (the latest session).
 *
 * @param currentPlayerIds - Array of player/team IDs in current ranking (ordered by Elo desc)
 * @param latestSessionId - Latest completed session ID (snapshot at start = state after previous session)
 * @param entityType - Type of entity: "player_singles" | "player_doubles" | "double_team"
 * @returns Map of entityId -> rank movement: positive = improved (rank went down), negative = worsened (rank went up), 0 = unchanged
 */
export async function computeRankMovements(
	currentPlayerIds: string[],
	latestSessionId: string | null,
	entityType: "player_singles" | "player_doubles" | "double_team",
	previousSessionId?: string | null
): Promise<Map<string, number>> {
	const movements = new Map<string, number>();

	// If no latest session, no movements to compute
	if (!latestSessionId) {
		return movements;
	}

	// Get previous session rankings from snapshots
	// Try latest session snapshot first (snapshot at start of Session N = state after Session N-1 completes)
	// If missing, try previous session snapshot as fallback
	let previousRankings = await getRankingFromSession(
		latestSessionId,
		entityType
	);

	// If no snapshots found for latest session, try previous session snapshot
	if (previousRankings.size === 0 && previousSessionId) {
		previousRankings = await getRankingFromSession(
			previousSessionId,
			entityType
		);
	}

	// If still no snapshots found, return zero movements for all entities
	// Statistics page is read-only and must never replay matches
	if (previousRankings.size === 0) {
		console.log("[RANK] No snapshots found for rank movements, returning zero movements for all entities");
		// Return zero movements for all current entities
		currentPlayerIds.forEach((playerId) => {
			movements.set(playerId, 0);
		});
		return movements;
	}
	
	console.log("[RANK] Computing movements:", {
		latestSessionId,
		entityType,
		currentPlayerCount: currentPlayerIds.length,
		previousRankingCount: previousRankings.size,
	});

	// Compute current rankings (1-indexed, based on order in array)
	currentPlayerIds.forEach((playerId, index) => {
		const currentRank = index + 1;
		const previousRank = previousRankings.get(playerId);

		if (previousRank === undefined) {
			// Player didn't exist in previous session (new player)
			// No movement indicator (treat as 0)
			movements.set(playerId, 0);
		} else {
			// Movement = previousRank - currentRank
			// Positive = improved (e.g., 3 -> 2 = +1)
			// Negative = worsened (e.g., 2 -> 3 = -1)
			// 0 = unchanged
			const movement = previousRank - currentRank;
			movements.set(playerId, movement);
			
			// Debug: Log non-zero movements
			if (movement !== 0) {
				console.log("[RANK] Movement detected:", {
					playerId,
					previousRank,
					currentRank,
					movement,
				});
			}
		}
	});

	return movements;
}

