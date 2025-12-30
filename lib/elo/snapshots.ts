import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Create Elo snapshots for players after a match completes
 *
 * @param matchId - The match ID
 * @param playerIds - Array of player IDs (2 for singles, 4 for doubles)
 * @param matchType - "singles" or "doubles"
 * @param playerStates - Optional: In-memory state to use instead of reading from DB
 *                       Map of playerId -> { elo, matches_played, wins, losses, draws, sets_won, sets_lost }
 */
export async function createEloSnapshots(
	matchId: string,
	playerIds: string[],
	matchType: "singles" | "doubles",
	playerStates?: Map<
		string,
		{
			elo: number;
			matches_played: number;
			wins: number;
			losses: number;
			draws: number;
			sets_won: number;
			sets_lost: number;
		}
	>
) {
	const adminClient = createAdminClient();

	if (matchType === "singles") {
		if (playerIds.length !== 2) {
			throw new Error("Singles match must have exactly 2 players");
		}

		// Create snapshots for both players
		const snapshots = [];

		// Use in-memory state if provided, otherwise read from DB
		if (playerStates) {
			for (const playerId of playerIds) {
				const state = playerStates.get(playerId);
				if (state) {
					snapshots.push({
						match_id: matchId,
						player_id: playerId,
						elo: state.elo,
						matches_played: state.matches_played,
						wins: state.wins,
						losses: state.losses,
						draws: state.draws,
						sets_won: state.sets_won,
						sets_lost: state.sets_lost,
					});
				} else {
					// Fallback to defaults if state not found
					snapshots.push({
						match_id: matchId,
						player_id: playerId,
						elo: 1500,
						matches_played: 0,
						wins: 0,
						losses: 0,
						draws: 0,
						sets_won: 0,
						sets_lost: 0,
					});
				}
			}
		} else {
			// Get current ratings for both players from DB
			const { data: rating1 } = await adminClient
				.from("player_ratings")
				.select("elo, wins, losses, draws, sets_won, sets_lost")
				.eq("player_id", playerIds[0])
				.single();

			const { data: rating2 } = await adminClient
				.from("player_ratings")
				.select("elo, wins, losses, draws, sets_won, sets_lost")
				.eq("player_id", playerIds[1])
				.single();

			if (rating1) {
				snapshots.push({
					match_id: matchId,
					player_id: playerIds[0],
					elo: rating1.elo,
					matches_played:
						(rating1.wins ?? 0) +
						(rating1.losses ?? 0) +
						(rating1.draws ?? 0),
					wins: rating1.wins ?? 0,
					losses: rating1.losses ?? 0,
					draws: rating1.draws ?? 0,
					sets_won: rating1.sets_won ?? 0,
					sets_lost: rating1.sets_lost ?? 0,
				});
			} else {
				snapshots.push({
					match_id: matchId,
					player_id: playerIds[0],
					elo: 1500,
					matches_played: 0,
					wins: 0,
					losses: 0,
					draws: 0,
					sets_won: 0,
					sets_lost: 0,
				});
			}

			if (rating2) {
				snapshots.push({
					match_id: matchId,
					player_id: playerIds[1],
					elo: rating2.elo,
					matches_played:
						(rating2.wins ?? 0) +
						(rating2.losses ?? 0) +
						(rating2.draws ?? 0),
					wins: rating2.wins ?? 0,
					losses: rating2.losses ?? 0,
					draws: rating2.draws ?? 0,
					sets_won: rating2.sets_won ?? 0,
					sets_lost: rating2.sets_lost ?? 0,
				});
			} else {
				snapshots.push({
					match_id: matchId,
					player_id: playerIds[1],
					elo: 1500,
					matches_played: 0,
					wins: 0,
					losses: 0,
					draws: 0,
					sets_won: 0,
					sets_lost: 0,
				});
			}
		}

		// Insert snapshots (upsert to handle duplicates)
		const { error: snapshotError } = await adminClient
			.from("elo_snapshots")
			.upsert(snapshots, {
				onConflict: "match_id,player_id",
			});

		if (snapshotError) {
			console.error("Error creating Elo snapshots:", snapshotError);
			throw new Error(
				`Failed to create Elo snapshots: ${snapshotError.message}`
			);
		}

		console.log(
			JSON.stringify({
				tag: "[SNAPSHOT_CREATED]",
				match_id: matchId,
				match_type: "singles",
				snapshots_created: snapshots.length,
				players: playerIds,
				used_in_memory_state: !!playerStates,
			})
		);
	} else {
		// Doubles matches - create snapshots for all 4 players
		if (playerIds.length !== 4) {
			throw new Error("Doubles match must have exactly 4 players");
		}

		const snapshots = [];

		// Use in-memory state if provided, otherwise read from DB
		if (playerStates) {
			for (const playerId of playerIds) {
				const state = playerStates.get(playerId);
				if (state) {
					snapshots.push({
						match_id: matchId,
						player_id: playerId,
						elo: state.elo,
						matches_played: state.matches_played,
						wins: state.wins,
						losses: state.losses,
						draws: state.draws,
						sets_won: state.sets_won,
						sets_lost: state.sets_lost,
					});
				} else {
					snapshots.push({
						match_id: matchId,
						player_id: playerId,
						elo: 1500,
						matches_played: 0,
						wins: 0,
						losses: 0,
						draws: 0,
						sets_won: 0,
						sets_lost: 0,
					});
				}
			}
		} else {
			// Get current ratings from DB
			for (const playerId of playerIds) {
				const { data: rating } = await adminClient
					.from("player_double_ratings")
					.select("elo, wins, losses, draws, sets_won, sets_lost")
					.eq("player_id", playerId)
					.single();

				if (rating) {
					snapshots.push({
						match_id: matchId,
						player_id: playerId,
						elo: rating.elo,
						matches_played:
							(rating.wins ?? 0) +
							(rating.losses ?? 0) +
							(rating.draws ?? 0),
						wins: rating.wins ?? 0,
						losses: rating.losses ?? 0,
						draws: rating.draws ?? 0,
						sets_won: rating.sets_won ?? 0,
						sets_lost: rating.sets_lost ?? 0,
					});
				} else {
					snapshots.push({
						match_id: matchId,
						player_id: playerId,
						elo: 1500,
						matches_played: 0,
						wins: 0,
						losses: 0,
						draws: 0,
						sets_won: 0,
						sets_lost: 0,
					});
				}
			}
		}

		const { error: snapshotError } = await adminClient
			.from("elo_snapshots")
			.upsert(snapshots, {
				onConflict: "match_id,player_id",
			});

		if (snapshotError) {
			console.error("Error creating Elo snapshots:", snapshotError);
			throw new Error(
				`Failed to create Elo snapshots: ${snapshotError.message}`
			);
		}

		console.log(
			JSON.stringify({
				tag: "[SNAPSHOT_CREATED]",
				match_id: matchId,
				match_type: "doubles",
				snapshots_created: snapshots.length,
				players: playerIds,
				used_in_memory_state: !!playerStates,
			})
		);
	}
}

/**
 * Get snapshot for a player before a given match
 *
 * @param playerId - Player ID
 * @param matchId - Match ID to get snapshot before
 * @returns Snapshot data or null if not found
 */
export async function getSnapshotBeforeMatch(
	playerId: string,
	matchId: string
) {
	const adminClient = createAdminClient();

	// Use the database function to get snapshot before match
	const { data, error } = await adminClient.rpc("get_snapshot_before_match", {
		p_player_id: playerId,
		p_match_id: matchId,
	});

	if (error) {
		console.error("Error getting snapshot before match:", error);
		return null;
	}

	if (!data || data.length === 0) {
		return null;
	}

	// Convert elo from NUMERIC(10,2) to number if needed
	const snapshot = data[0];
	return {
		...snapshot,
		elo:
			typeof snapshot.elo === "string"
				? parseFloat(snapshot.elo)
				: Number(snapshot.elo),
	};
}

/**
 * Get initial baseline for a player in a session
 * This is the player's rating state before any matches in the session
 *
 * @param playerId - Player ID
 * @param sessionId - Session ID
 * @returns Baseline rating data
 */
export async function getInitialBaseline(playerId: string, sessionId: string) {
	const adminClient = createAdminClient();

	// Use the database function to get initial baseline
	const { data, error } = await adminClient.rpc("get_initial_baseline", {
		p_player_id: playerId,
		p_session_id: sessionId,
	});

	if (error) {
		console.error("Error getting initial baseline:", error);
		// Return default if error
		return {
			elo: 1500,
			matches_played: 0,
			wins: 0,
			losses: 0,
			draws: 0,
			sets_won: 0,
			sets_lost: 0,
		};
	}

	if (!data || data.length === 0) {
		return {
			elo: 1500,
			matches_played: 0,
			wins: 0,
			losses: 0,
			draws: 0,
			sets_won: 0,
			sets_lost: 0,
		};
	}

	// Convert elo from NUMERIC(10,2) to number if needed
	const baseline = data[0];
	return {
		...baseline,
		elo:
			typeof baseline.elo === "string"
				? parseFloat(baseline.elo)
				: Number(baseline.elo),
	};
}

/**
 * Get snapshot from the previous completed session (Session N-1)
 * Used as baseline when editing matches in Session N
 *
 * @param playerId - Player ID
 * @param currentSessionId - Current session ID (Session N)
 * @returns Snapshot from previous session or null if not found
 */
export async function getPreviousSessionSnapshot(
	playerId: string,
	currentSessionId: string
): Promise<{
	elo: number;
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
	sets_won: number;
	sets_lost: number;
} | null> {
	const adminClient = createAdminClient();

	// Get current session's created_at
	const { data: currentSession, error: sessionError } = await adminClient
		.from("sessions")
		.select("created_at")
		.eq("id", currentSessionId)
		.single();

	if (sessionError || !currentSession) {
		console.error("Error getting current session:", sessionError);
		return null;
	}

	// Find most recent completed session before current session
	const { data: previousSessions, error: prevSessionError } =
		await adminClient
			.from("sessions")
			.select("id, created_at")
			.lt("created_at", currentSession.created_at)
			.eq("status", "completed")
			.order("created_at", { ascending: false })
			.limit(1);

	if (
		prevSessionError ||
		!previousSessions ||
		previousSessions.length === 0
	) {
		// No previous completed session found
		return null;
	}

	const previousSessionId = previousSessions[0].id;

	// Get snapshot from previous session
	const { data: snapshot, error: snapshotError } = await adminClient
		.from("session_rating_snapshots")
		.select("elo, matches_played, wins, losses, draws, sets_won, sets_lost")
		.eq("session_id", previousSessionId)
		.eq("entity_type", "player_singles")
		.eq("entity_id", playerId)
		.single();

	if (snapshotError || !snapshot) {
		// No snapshot found for previous session
		return null;
	}

	// Convert elo from NUMERIC(10,2) to number if needed
	return {
		elo:
			typeof snapshot.elo === "string"
				? parseFloat(snapshot.elo)
				: Number(snapshot.elo),
		matches_played: snapshot.matches_played,
		wins: snapshot.wins,
		losses: snapshot.losses,
		draws: snapshot.draws,
		sets_won: snapshot.sets_won,
		sets_lost: snapshot.sets_lost,
	};
}

/**
 * Update or create session snapshot after recalculation
 * This overwrites the snapshot for Session N with the final computed state
 *
 * @param sessionId - Session ID
 * @param playerId - Player ID
 * @param state - Final computed Elo state
 */
export async function updateSessionSnapshot(
	sessionId: string,
	playerId: string,
	state: {
		elo: number;
		matches_played: number;
		wins: number;
		losses: number;
		draws: number;
		sets_won: number;
		sets_lost: number;
	}
): Promise<void> {
	const adminClient = createAdminClient();

	// Upsert snapshot for Session N
	const { error } = await adminClient.from("session_rating_snapshots").upsert(
		{
			session_id: sessionId,
			entity_type: "player_singles",
			entity_id: playerId,
			elo: state.elo,
			matches_played: state.matches_played,
			wins: state.wins,
			losses: state.losses,
			draws: state.draws,
			sets_won: state.sets_won,
			sets_lost: state.sets_lost,
		},
		{
			onConflict: "session_id,entity_type,entity_id",
		}
	);

	if (error) {
		console.error("Error updating session snapshot:", error);
		throw new Error(`Failed to update session snapshot: ${error.message}`);
	}
}
