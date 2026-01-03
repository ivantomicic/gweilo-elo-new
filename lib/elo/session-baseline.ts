import { createAdminClient } from "@/lib/supabase/admin";
import { calculateEloDelta, type MatchResult } from "./calculation";
import { getOrCreateDoubleTeam } from "./double-teams";

/**
 * Get session baseline by replaying all previous sessions
 *
 * For session N, this replays all sessions < N in chronological order
 * and returns the Elo state after the last previous session.
 *
 * This is the correct baseline for session N:
 * - elo_before = result of this function
 * - elo_after = result of this function + replaying session N's matches
 *
 * @param sessionId - Current session ID
 * @returns Map of playerId -> { elo, matches_played, wins, losses, draws }
 */
export async function getSessionBaseline(
	sessionId: string
): Promise<Map<string, { elo: number; matches_played: number; wins: number; losses: number; draws: number }>> {
	const adminClient = createAdminClient();

	// Get current session's created_at
	const { data: currentSession, error: currentSessionError } =
		await adminClient
			.from("sessions")
			.select("created_at")
			.eq("id", sessionId)
			.single();

	if (currentSessionError || !currentSession) {
		console.error("Error getting current session:", currentSessionError);
		// Return default baseline (1500/0) if session not found
		return new Map();
	}

	// Get all completed sessions before this session, in chronological order
	const { data: previousSessions, error: prevSessionsError } =
		await adminClient
			.from("sessions")
			.select("id, created_at")
			.lt("created_at", currentSession.created_at)
			.eq("status", "completed")
			.order("created_at", { ascending: true });

	if (prevSessionsError) {
		console.error("Error fetching previous sessions:", prevSessionsError);
		// Return default baseline on error
		return new Map();
	}

	// Initialize baseline state (defaults to 1500/0 for all players)
	const baselineState = new Map<
		string,
		{
			elo: number;
			matches_played: number;
			wins: number;
			losses: number;
			draws: number;
		}
	>();

	// If no previous sessions, return empty map (will default to 1500/0)
	if (!previousSessions || previousSessions.length === 0) {
		return baselineState;
	}

	// Collect all player IDs from previous sessions
	const allPlayerIds = new Set<string>();

	// Replay each previous session in chronological order
	for (const prevSession of previousSessions) {
		// Fetch all matches for this session
		const { data: sessionMatches, error: matchesError } = await adminClient
			.from("session_matches")
			.select("*")
			.eq("session_id", prevSession.id)
			.eq("status", "completed")
			.order("round_number", { ascending: true })
			.order("match_order", { ascending: true });

		if (matchesError || !sessionMatches) {
			console.error(
				`Error fetching matches for session ${prevSession.id}:`,
				matchesError
			);
			continue;
		}

		// Replay each match
		for (const match of sessionMatches) {
			if (
				match.team1_score === null ||
				match.team2_score === null ||
				!match.player_ids ||
				match.player_ids.length < 2
			) {
				continue;
			}

			const isSingles = match.match_type === "singles";
			const playerIds = match.player_ids as string[];

			if (isSingles) {
				// Initialize players if not in baseline
				for (const playerId of playerIds) {
					allPlayerIds.add(playerId);
					if (!baselineState.has(playerId)) {
						baselineState.set(playerId, {
							elo: 1500,
							matches_played: 0,
							wins: 0,
							losses: 0,
							draws: 0,
						});
					}
				}

				const player1State = baselineState.get(playerIds[0])!;
				const player2State = baselineState.get(playerIds[1])!;

				// Determine result
				const player1Result: "win" | "loss" | "draw" =
					match.team1_score > match.team2_score
						? "win"
						: match.team1_score < match.team2_score
						? "loss"
						: "draw";
				const player2Result: "win" | "loss" | "draw" =
					match.team2_score > match.team1_score
						? "win"
						: match.team2_score < match.team1_score
						? "loss"
						: "draw";

				// Calculate Elo deltas
				const player1MatchCount = player1State.matches_played;
				const player2MatchCount = player2State.matches_played;

				const player1Delta = calculateEloDelta(
					player1State.elo,
					player2State.elo,
					player1Result as MatchResult,
					player1MatchCount
				);
				const player2Delta = calculateEloDelta(
					player2State.elo,
					player1State.elo,
					player2Result as MatchResult,
					player2MatchCount
				);

				// Update state
				player1State.elo += player1Delta;
				player1State.matches_played += 1;
				if (player1Result === "win") player1State.wins += 1;
				if (player1Result === "loss") player1State.losses += 1;
				if (player1Result === "draw") player1State.draws += 1;

				player2State.elo += player2Delta;
				player2State.matches_played += 1;
				if (player2Result === "win") player2State.wins += 1;
				if (player2Result === "loss") player2State.losses += 1;
				if (player2Result === "draw") player2State.draws += 1;
			} else {
				// Doubles match
				// Note: Session summary tracks singles Elo only (from player_ratings)
				// Doubles matches affect player_double_ratings, not player_ratings
				// So we skip doubles matches in baseline calculation for singles Elo
			}
		}
	}

	return baselineState;
}

/**
 * Replay a single session's matches to compute post-session Elo
 *
 * @param sessionId - Session ID to replay
 * @param baselineState - Baseline state (Elo before this session)
 * @returns Map of playerId -> { elo, matches_played, wins, losses, draws } after session
 */
export async function replaySessionMatches(
	sessionId: string,
	baselineState: Map<
		string,
		{ elo: number; matches_played: number; wins: number; losses: number; draws: number }
	>
): Promise<Map<string, { elo: number; matches_played: number; wins: number; losses: number; draws: number }>> {
	const adminClient = createAdminClient();

	// Clone baseline state for replay
	const postSessionState = new Map<
		string,
		{ elo: number; matches_played: number; wins: number; losses: number; draws: number }
	>();

	for (const [playerId, state] of baselineState.entries()) {
		postSessionState.set(playerId, { ...state });
	}

	// Fetch all matches for this session
	const { data: sessionMatches, error: matchesError } = await adminClient
		.from("session_matches")
		.select("*")
		.eq("session_id", sessionId)
		.eq("status", "completed")
		.order("round_number", { ascending: true })
		.order("match_order", { ascending: true });

	if (matchesError || !sessionMatches) {
		console.error(`Error fetching matches for session ${sessionId}:`, matchesError);
		return postSessionState;
	}

	// Replay each match
	for (const match of sessionMatches) {
		if (
			match.team1_score === null ||
			match.team2_score === null ||
			!match.player_ids ||
			match.player_ids.length < 2
		) {
			continue;
		}

		const isSingles = match.match_type === "singles";
		const playerIds = match.player_ids as string[];

		if (isSingles) {
			// Initialize players if not in state
			for (const playerId of playerIds) {
				if (!postSessionState.has(playerId)) {
					postSessionState.set(playerId, {
						elo: 1500,
						matches_played: 0,
						wins: 0,
						losses: 0,
						draws: 0,
					});
				}
			}

			const player1State = postSessionState.get(playerIds[0])!;
			const player2State = postSessionState.get(playerIds[1])!;

			// Determine result
			const player1Result: "win" | "loss" | "draw" =
				match.team1_score > match.team2_score
					? "win"
					: match.team1_score < match.team2_score
					? "loss"
					: "draw";
			const player2Result: "win" | "loss" | "draw" =
				match.team2_score > match.team1_score
					? "win"
					: match.team2_score < match.team1_score
					? "loss"
					: "draw";

			// Calculate Elo deltas
			const player1MatchCount = player1State.matches_played;
			const player2MatchCount = player2State.matches_played;

			const player1Delta = calculateEloDelta(
				player1State.elo,
				player2State.elo,
				player1Result as MatchResult,
				player1MatchCount
			);
			const player2Delta = calculateEloDelta(
				player2State.elo,
				player1State.elo,
				player2Result as MatchResult,
				player2MatchCount
			);

			// Update state
			player1State.elo += player1Delta;
			player1State.matches_played += 1;
			if (player1Result === "win") player1State.wins += 1;
			if (player1Result === "loss") player1State.losses += 1;
			if (player1Result === "draw") player1State.draws += 1;

			player2State.elo += player2Delta;
			player2State.matches_played += 1;
			if (player2Result === "win") player2State.wins += 1;
			if (player2Result === "loss") player2State.losses += 1;
			if (player2Result === "draw") player2State.draws += 1;
		}
		// Note: Doubles matches affect player_double_ratings, not player_ratings
		// Session summary shows singles Elo (player_ratings), so we skip doubles matches
	}

	return postSessionState;
}

/**
 * Get doubles player baseline by replaying all previous sessions' doubles matches
 *
 * For session N, this replays all doubles matches from sessions < N in chronological order
 * and returns the player_double_ratings state after the last previous session.
 *
 * @param sessionId - Current session ID
 * @returns Map of playerId -> { elo, matches_played, wins, losses, draws }
 */
export async function getDoublesPlayerBaseline(
	sessionId: string
): Promise<Map<string, { elo: number; matches_played: number; wins: number; losses: number; draws: number }>> {
	const adminClient = createAdminClient();

	// Get current session's created_at
	const { data: currentSession, error: currentSessionError } =
		await adminClient
			.from("sessions")
			.select("created_at")
			.eq("id", sessionId)
			.single();

	if (currentSessionError || !currentSession) {
		console.error("Error getting current session:", currentSessionError);
		return new Map();
	}

	// Get all completed sessions before this session, in chronological order
	const { data: previousSessions, error: prevSessionsError } =
		await adminClient
			.from("sessions")
			.select("id, created_at")
			.lt("created_at", currentSession.created_at)
			.eq("status", "completed")
			.order("created_at", { ascending: true });

	if (prevSessionsError) {
		console.error("Error fetching previous sessions:", prevSessionsError);
		return new Map();
	}

	// Initialize baseline state (defaults to 1500/0 for all players)
	const baselineState = new Map<
		string,
		{
			elo: number;
			matches_played: number;
			wins: number;
			losses: number;
			draws: number;
		}
	>();

	// If no previous sessions, return empty map (will default to 1500/0)
	if (!previousSessions || previousSessions.length === 0) {
		return baselineState;
	}

	// Replay each previous session in chronological order
	for (const prevSession of previousSessions) {
		// Fetch all doubles matches for this session
		const { data: sessionMatches, error: matchesError } = await adminClient
			.from("session_matches")
			.select("*")
			.eq("session_id", prevSession.id)
			.eq("match_type", "doubles")
			.eq("status", "completed")
			.order("round_number", { ascending: true })
			.order("match_order", { ascending: true });

		if (matchesError || !sessionMatches) {
			console.error(
				`Error fetching doubles matches for session ${prevSession.id}:`,
				matchesError
			);
			continue;
		}

		// Replay each doubles match
		for (const match of sessionMatches) {
			if (
				match.team1_score === null ||
				match.team2_score === null ||
				!match.player_ids ||
				match.player_ids.length < 4
			) {
				continue;
			}

			const playerIds = match.player_ids as string[];
			const team1Players = [playerIds[0], playerIds[1]];
			const team2Players = [playerIds[2], playerIds[3]];
			const score1 = match.team1_score;
			const score2 = match.team2_score;

			// Initialize players if not in baseline
			for (const playerId of playerIds) {
				if (!baselineState.has(playerId)) {
					baselineState.set(playerId, {
						elo: 1500,
						matches_played: 0,
						wins: 0,
						losses: 0,
						draws: 0,
					});
				}
			}

			// Get player doubles states
			const player1State = baselineState.get(playerIds[0])!;
			const player2State = baselineState.get(playerIds[1])!;
			const player3State = baselineState.get(playerIds[2])!;
			const player4State = baselineState.get(playerIds[3])!;

			// Calculate team averages from player doubles Elo
			const team1PlayerAverageElo = (player1State.elo + player2State.elo) / 2;
			const team2PlayerAverageElo = (player3State.elo + player4State.elo) / 2;

			// Determine result
			const team1Result: "win" | "loss" | "draw" =
				score1 > score2
					? "win"
					: score1 < score2
					? "loss"
					: "draw";
			const team2Result: "win" | "loss" | "draw" =
				score2 > score1
					? "win"
					: score2 < score1
					? "loss"
					: "draw";

			// Calculate player doubles match counts for K-factor (before this match)
			const team1PlayerAverageMatchCount =
				(player1State.matches_played + player2State.matches_played) / 2;
			const team2PlayerAverageMatchCount =
				(player3State.matches_played + player4State.matches_played) / 2;

			// Calculate player doubles deltas using player-average expected score
			const playerDoublesTeam1Delta = calculateEloDelta(
				team1PlayerAverageElo,
				team2PlayerAverageElo,
				team1Result as MatchResult,
				team1PlayerAverageMatchCount
			);
			const playerDoublesTeam2Delta = calculateEloDelta(
				team2PlayerAverageElo,
				team1PlayerAverageElo,
				team2Result as MatchResult,
				team2PlayerAverageMatchCount
			);

			// Apply deltas (both players on same team get same delta)
			player1State.elo += playerDoublesTeam1Delta;
			player2State.elo += playerDoublesTeam1Delta;
			player3State.elo += playerDoublesTeam2Delta;
			player4State.elo += playerDoublesTeam2Delta;

			// Update stats
			for (const playerId of team1Players) {
				const state = baselineState.get(playerId)!;
				state.matches_played += 1;
				if (team1Result === "win") state.wins += 1;
				if (team1Result === "loss") state.losses += 1;
				if (team1Result === "draw") state.draws += 1;
			}

			for (const playerId of team2Players) {
				const state = baselineState.get(playerId)!;
				state.matches_played += 1;
				if (team2Result === "win") state.wins += 1;
				if (team2Result === "loss") state.losses += 1;
				if (team2Result === "draw") state.draws += 1;
			}
		}
	}

	return baselineState;
}

/**
 * Replay a single session's doubles matches to compute post-session player doubles Elo
 *
 * @param sessionId - Session ID to replay
 * @param baselineState - Baseline state (player doubles Elo before this session)
 * @returns Map of playerId -> { elo, matches_played, wins, losses, draws } after session
 */
export async function replayDoublesPlayerMatches(
	sessionId: string,
	baselineState: Map<
		string,
		{ elo: number; matches_played: number; wins: number; losses: number; draws: number }
	>
): Promise<Map<string, { elo: number; matches_played: number; wins: number; losses: number; draws: number }>> {
	const adminClient = createAdminClient();

	// Clone baseline state for replay
	const postSessionState = new Map<
		string,
		{ elo: number; matches_played: number; wins: number; losses: number; draws: number }
	>();

	for (const [playerId, state] of baselineState.entries()) {
		postSessionState.set(playerId, { ...state });
	}

	// Fetch all doubles matches for this session
	const { data: sessionMatches, error: matchesError } = await adminClient
		.from("session_matches")
		.select("*")
		.eq("session_id", sessionId)
		.eq("match_type", "doubles")
		.eq("status", "completed")
		.order("round_number", { ascending: true })
		.order("match_order", { ascending: true });

	if (matchesError || !sessionMatches) {
		console.error(`Error fetching doubles matches for session ${sessionId}:`, matchesError);
		return postSessionState;
	}

	// Replay each match
	for (const match of sessionMatches) {
		if (
			match.team1_score === null ||
			match.team2_score === null ||
			!match.player_ids ||
			match.player_ids.length < 4
		) {
			continue;
		}

		const playerIds = match.player_ids as string[];
		const team1Players = [playerIds[0], playerIds[1]];
		const team2Players = [playerIds[2], playerIds[3]];
		const score1 = match.team1_score;
		const score2 = match.team2_score;

		// Initialize players if not in state
		for (const playerId of playerIds) {
			if (!postSessionState.has(playerId)) {
				postSessionState.set(playerId, {
					elo: 1500,
					matches_played: 0,
					wins: 0,
					losses: 0,
					draws: 0,
				});
			}
		}

		// Get player doubles states
		const player1State = postSessionState.get(playerIds[0])!;
		const player2State = postSessionState.get(playerIds[1])!;
		const player3State = postSessionState.get(playerIds[2])!;
		const player4State = postSessionState.get(playerIds[3])!;

		// Calculate team averages from player doubles Elo
		const team1PlayerAverageElo = (player1State.elo + player2State.elo) / 2;
		const team2PlayerAverageElo = (player3State.elo + player4State.elo) / 2;

		// Determine result
		const team1Result: "win" | "loss" | "draw" =
			score1 > score2
				? "win"
				: score1 < score2
				? "loss"
				: "draw";
		const team2Result: "win" | "loss" | "draw" =
			score2 > score1
				? "win"
				: score2 < score1
				? "loss"
				: "draw";

		// Calculate player doubles match counts for K-factor (before this match)
		const team1PlayerAverageMatchCount =
			(player1State.matches_played + player2State.matches_played) / 2;
		const team2PlayerAverageMatchCount =
			(player3State.matches_played + player4State.matches_played) / 2;

		// Calculate player doubles deltas using player-average expected score
		const playerDoublesTeam1Delta = calculateEloDelta(
			team1PlayerAverageElo,
			team2PlayerAverageElo,
			team1Result as MatchResult,
			team1PlayerAverageMatchCount
		);
		const playerDoublesTeam2Delta = calculateEloDelta(
			team2PlayerAverageElo,
			team1PlayerAverageElo,
			team2Result as MatchResult,
			team2PlayerAverageMatchCount
		);

		// Apply deltas (both players on same team get same delta)
		player1State.elo += playerDoublesTeam1Delta;
		player2State.elo += playerDoublesTeam1Delta;
		player3State.elo += playerDoublesTeam2Delta;
		player4State.elo += playerDoublesTeam2Delta;

		// Update stats
		for (const playerId of team1Players) {
			const state = postSessionState.get(playerId)!;
			state.matches_played += 1;
			if (team1Result === "win") state.wins += 1;
			if (team1Result === "loss") state.losses += 1;
			if (team1Result === "draw") state.draws += 1;
		}

		for (const playerId of team2Players) {
			const state = postSessionState.get(playerId)!;
			state.matches_played += 1;
			if (team2Result === "win") state.wins += 1;
			if (team2Result === "loss") state.losses += 1;
			if (team2Result === "draw") state.draws += 1;
		}
	}

	return postSessionState;
}

/**
 * Get doubles team baseline by replaying all previous sessions' doubles matches
 *
 * @param sessionId - Current session ID
 * @returns Map of teamId -> { elo, matches_played, wins, losses, draws }
 */
export async function getDoublesTeamBaseline(
	sessionId: string
): Promise<Map<string, { elo: number; matches_played: number; wins: number; losses: number; draws: number; player1Id: string; player2Id: string }>> {
	const adminClient = createAdminClient();

	// Get current session's created_at
	const { data: currentSession, error: currentSessionError } =
		await adminClient
			.from("sessions")
			.select("created_at")
			.eq("id", sessionId)
			.single();

	if (currentSessionError || !currentSession) {
		console.error("Error getting current session:", currentSessionError);
		return new Map();
	}

	// Get all completed sessions before this session, in chronological order
	const { data: previousSessions, error: prevSessionsError } =
		await adminClient
			.from("sessions")
			.select("id, created_at")
			.lt("created_at", currentSession.created_at)
			.eq("status", "completed")
			.order("created_at", { ascending: true });

	if (prevSessionsError) {
		console.error("Error fetching previous sessions:", prevSessionsError);
		return new Map();
	}

	// Initialize baseline state (defaults to 1500/0 for all teams)
	const baselineState = new Map<
		string,
		{
			elo: number;
			matches_played: number;
			wins: number;
			losses: number;
			draws: number;
			player1Id: string;
			player2Id: string;
		}
	>();

	// If no previous sessions, return empty map (will default to 1500/0)
	if (!previousSessions || previousSessions.length === 0) {
		return baselineState;
	}

	// Replay each previous session in chronological order
	for (const prevSession of previousSessions) {
		// Fetch all doubles matches for this session
		const { data: sessionMatches, error: matchesError } = await adminClient
			.from("session_matches")
			.select("*")
			.eq("session_id", prevSession.id)
			.eq("match_type", "doubles")
			.eq("status", "completed")
			.order("round_number", { ascending: true })
			.order("match_order", { ascending: true });

		if (matchesError || !sessionMatches) {
			console.error(
				`Error fetching doubles matches for session ${prevSession.id}:`,
				matchesError
			);
			continue;
		}

		// Replay each doubles match
		for (const match of sessionMatches) {
			if (
				match.team1_score === null ||
				match.team2_score === null ||
				!match.player_ids ||
				match.player_ids.length < 4
			) {
				continue;
			}

			const playerIds = match.player_ids as string[];
			const team1Id = await getOrCreateDoubleTeam(playerIds[0], playerIds[1]);
			const team2Id = await getOrCreateDoubleTeam(playerIds[2], playerIds[3]);
			const score1 = match.team1_score;
			const score2 = match.team2_score;

			// Initialize teams if not in baseline
			if (!baselineState.has(team1Id)) {
				baselineState.set(team1Id, {
					elo: 1500,
					matches_played: 0,
					wins: 0,
					losses: 0,
					draws: 0,
					player1Id: playerIds[0],
					player2Id: playerIds[1],
				});
			}

			if (!baselineState.has(team2Id)) {
				baselineState.set(team2Id, {
					elo: 1500,
					matches_played: 0,
					wins: 0,
					losses: 0,
					draws: 0,
					player1Id: playerIds[2],
					player2Id: playerIds[3],
				});
			}

			const team1State = baselineState.get(team1Id)!;
			const team2State = baselineState.get(team2Id)!;

			// Determine result
			const team1Result: "win" | "loss" | "draw" =
				score1 > score2
					? "win"
					: score1 < score2
					? "loss"
					: "draw";
			const team2Result: "win" | "loss" | "draw" =
				score2 > score1
					? "win"
					: score2 < score1
					? "loss"
					: "draw";

			// Calculate team Elo deltas
			const team1MatchCount = team1State.matches_played;
			const team2MatchCount = team2State.matches_played;

			const team1Delta = calculateEloDelta(
				team1State.elo,
				team2State.elo,
				team1Result as MatchResult,
				team1MatchCount
			);
			const team2Delta = calculateEloDelta(
				team2State.elo,
				team1State.elo,
				team2Result as MatchResult,
				team2MatchCount
			);

			// Update state
			team1State.elo += team1Delta;
			team2State.elo += team2Delta;
			team1State.matches_played += 1;
			team2State.matches_played += 1;

			if (team1Result === "win") {
				team1State.wins += 1;
				team2State.losses += 1;
			} else if (team1Result === "loss") {
				team1State.losses += 1;
				team2State.wins += 1;
			} else {
				team1State.draws += 1;
				team2State.draws += 1;
			}
		}
	}

	return baselineState;
}

/**
 * Replay a single session's doubles matches to compute post-session team Elo
 *
 * @param sessionId - Session ID to replay
 * @param baselineState - Baseline state (team Elo before this session)
 * @returns Map of teamId -> { elo, matches_played, wins, losses, draws, player1Id, player2Id } after session
 */
export async function replayDoublesTeamMatches(
	sessionId: string,
	baselineState: Map<
		string,
		{ elo: number; matches_played: number; wins: number; losses: number; draws: number; player1Id: string; player2Id: string }
	>
): Promise<Map<string, { elo: number; matches_played: number; wins: number; losses: number; draws: number; player1Id: string; player2Id: string }>> {
	const adminClient = createAdminClient();

	// Clone baseline state for replay
	const postSessionState = new Map<
		string,
		{ elo: number; matches_played: number; wins: number; losses: number; draws: number; player1Id: string; player2Id: string }
	>();

	for (const [teamId, state] of baselineState.entries()) {
		postSessionState.set(teamId, { ...state });
	}

	// Fetch all doubles matches for this session
	const { data: sessionMatches, error: matchesError } = await adminClient
		.from("session_matches")
		.select("*")
		.eq("session_id", sessionId)
		.eq("match_type", "doubles")
		.eq("status", "completed")
		.order("round_number", { ascending: true })
		.order("match_order", { ascending: true });

	if (matchesError || !sessionMatches) {
		console.error(`Error fetching doubles matches for session ${sessionId}:`, matchesError);
		return postSessionState;
	}

	// Replay each match
	for (const match of sessionMatches) {
		if (
			match.team1_score === null ||
			match.team2_score === null ||
			!match.player_ids ||
			match.player_ids.length < 4
		) {
			continue;
		}

		const playerIds = match.player_ids as string[];
		const team1Id = await getOrCreateDoubleTeam(playerIds[0], playerIds[1]);
		const team2Id = await getOrCreateDoubleTeam(playerIds[2], playerIds[3]);
		const score1 = match.team1_score;
		const score2 = match.team2_score;

		// Initialize teams if not in state
		if (!postSessionState.has(team1Id)) {
			postSessionState.set(team1Id, {
				elo: 1500,
				matches_played: 0,
				wins: 0,
				losses: 0,
				draws: 0,
				player1Id: playerIds[0],
				player2Id: playerIds[1],
			});
		}

		if (!postSessionState.has(team2Id)) {
			postSessionState.set(team2Id, {
				elo: 1500,
				matches_played: 0,
				wins: 0,
				losses: 0,
				draws: 0,
				player1Id: playerIds[2],
				player2Id: playerIds[3],
			});
		}

		const team1State = postSessionState.get(team1Id)!;
		const team2State = postSessionState.get(team2Id)!;

		// Determine result
		const team1Result: "win" | "loss" | "draw" =
			score1 > score2
				? "win"
				: score1 < score2
				? "loss"
				: "draw";
		const team2Result: "win" | "loss" | "draw" =
			score2 > score1
				? "win"
				: score2 < score1
				? "loss"
				: "draw";

		// Calculate team Elo deltas
		const team1MatchCount = team1State.matches_played;
		const team2MatchCount = team2State.matches_played;

		const team1Delta = calculateEloDelta(
			team1State.elo,
			team2State.elo,
			team1Result as MatchResult,
			team1MatchCount
		);
		const team2Delta = calculateEloDelta(
			team2State.elo,
			team1State.elo,
			team2Result as MatchResult,
			team2MatchCount
		);

		// Update state
		team1State.elo += team1Delta;
		team2State.elo += team2Delta;
		team1State.matches_played += 1;
		team2State.matches_played += 1;

		if (team1Result === "win") {
			team1State.wins += 1;
			team2State.losses += 1;
		} else if (team1Result === "loss") {
			team1State.losses += 1;
			team2State.wins += 1;
		} else {
			team1State.draws += 1;
			team2State.draws += 1;
		}
	}

	return postSessionState;
}
