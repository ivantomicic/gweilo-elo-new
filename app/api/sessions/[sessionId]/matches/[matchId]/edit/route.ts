import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
	getPreviousSessionSnapshot,
	updateSessionSnapshot,
	createEloSnapshots,
} from "@/lib/elo/snapshots";
import {
	calculateEloDelta,
	calculateKFactor,
	calculateExpectedScore,
	getActualScore,
	type MatchResult,
} from "@/lib/elo/calculation";
import { getOrCreateDoubleTeam } from "@/lib/elo/double-teams";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

// TypeScript: ensure these are strings after the check
const SUPABASE_URL = supabaseUrl;
const SUPABASE_ANON_KEY = supabaseAnonKey;

/**
 * POST /api/sessions/[sessionId]/matches/[matchId]/edit
 *
 * Edit a match result using session-level snapshot recalculation
 *
 * This endpoint:
 * 1. Loads baseline from Session N-1 snapshot (previous completed session)
 * 2. If no snapshot exists, falls back to initial baseline (1500)
 * 3. Replays ONLY matches from current session (Session N), starting from match 1
 * 4. Does NOT replay matches from earlier sessions
 * 5. Updates Session N snapshot after recalculation
 * 6. Persists final state to player_ratings
 *
 * Request body:
 * {
 *   team1Score: number,
 *   team2Score: number,
 *   reason?: string (optional)
 * }
 */
export async function POST(
	request: NextRequest,
	{ params }: { params: { sessionId: string; matchId: string } }
) {
	const adminClient = createAdminClient();

	try {
		const authHeader = request.headers.get("authorization");
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 }
			);
		}

		const token = authHeader.replace("Bearer ", "");
		const sessionId = params.sessionId;
		const matchId = params.matchId;

		if (!sessionId || !matchId) {
			return NextResponse.json(
				{ error: "Session ID and match ID are required" },
				{ status: 400 }
			);
		}

		const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
			global: {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		});

		// Verify user is authenticated
		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser(token);

		if (userError || !user) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 }
			);
		}

		// Verify user owns the session
		const { data: session, error: sessionError } = await supabase
			.from("sessions")
			.select("created_by, recalc_status")
			.eq("id", sessionId)
			.single();

		if (sessionError || !session) {
			return NextResponse.json(
				{ error: "Session not found" },
				{ status: 404 }
			);
		}

		if (session.created_by !== user.id) {
			return NextResponse.json(
				{
					error: "Unauthorized. You can only edit matches in your own sessions.",
				},
				{ status: 403 }
			);
		}

		// Parse request body
		const body = await request.json();
		const {
			team1Score,
			team2Score,
			reason,
		}: { team1Score: number; team2Score: number; reason?: string } = body;

		if (
			typeof team1Score !== "number" ||
			typeof team2Score !== "number" ||
			isNaN(team1Score) ||
			isNaN(team2Score)
		) {
			return NextResponse.json(
				{ error: "team1Score and team2Score must be valid numbers" },
				{ status: 400 }
			);
		}

		// Step 1: Acquire lock
		await adminClient
			.from("sessions")
			.update({ recalc_status: "idle" })
			.eq("id", sessionId)
			.is("recalc_status", null);

		const recalcToken = crypto.randomUUID();
		const { data: lockResult, error: lockError } = await adminClient
			.from("sessions")
			.update({
				recalc_status: "running",
				recalc_token: recalcToken,
				recalc_started_at: new Date().toISOString(),
			})
			.eq("id", sessionId)
			.in("recalc_status", ["idle", "done", "failed"])
			.select()
			.single();

		if (lockError || !lockResult) {
			const { data: currentSession } = await adminClient
				.from("sessions")
				.select("recalc_status")
				.eq("id", sessionId)
				.single();

			if (currentSession?.recalc_status === "running") {
				return NextResponse.json(
					{
						error: "Recalculation already in progress. Please wait.",
					},
					{ status: 409 }
				);
			}

			console.error("Lock acquisition failed:", lockError);
			return NextResponse.json(
				{
					error: "Failed to acquire recalculation lock",
					details: lockError?.message || "Unknown error",
				},
				{ status: 500 }
			);
		}

		try {
			// Step 2: Fetch ONLY matches from current session (Session N)
			// CRITICAL: We only replay matches from the current session, not from earlier sessions
			const { data: allMatches, error: allMatchesError } =
				await adminClient
					.from("session_matches")
					.select("*")
					.eq("session_id", sessionId)
					.order("round_number", { ascending: true })
					.order("match_order", { ascending: true });

			if (allMatchesError || !allMatches) {
				await adminClient
					.from("sessions")
					.update({ recalc_status: "failed" })
					.eq("id", sessionId);
				return NextResponse.json(
					{ error: "Failed to fetch session matches" },
					{ status: 500 }
				);
			}

			// Validate match types
			const invalidMatches = allMatches.filter(
				(m: any) =>
					m.match_type !== "singles" && m.match_type !== "doubles"
			);
			if (invalidMatches.length > 0) {
				console.error(
					`Found ${invalidMatches.length} matches with invalid match_type:`,
					invalidMatches
				);
				await adminClient
					.from("sessions")
					.update({ recalc_status: "failed" })
					.eq("id", sessionId);
				return NextResponse.json(
					{
						error: `Invalid match types found: ${invalidMatches
							.map((m) => m.id)
							.join(", ")}`,
					},
					{ status: 500 }
				);
			}

			const singlesCount = allMatches.filter(
				(m: any) => m.match_type === "singles"
			).length;
			const doublesCount = allMatches.filter(
				(m: any) => m.match_type === "doubles"
			).length;

			// 1️⃣ RECALCULATION ENTRY LOG
			console.log(
				JSON.stringify({
					tag: "[RECALC_START]",
					session_id: sessionId,
					edited_match_id: matchId,
					total_matches_in_session: allMatches.length,
					singles_count: singlesCount,
					doubles_count: doublesCount,
					approach: "session_level_snapshots",
					matches: allMatches.map((m: any, idx: number) => ({
						index: idx,
						id: m.id,
						round_number: m.round_number,
						match_order: m.match_order,
						match_type: m.match_type,
						players: m.player_ids,
						team1_score: m.team1_score,
						team2_score: m.team2_score,
						status: m.status,
					})),
					new_scores: { team1Score, team2Score },
				})
			);

			// Find the position of the match to edit in current session
			const matchIndex = allMatches.findIndex(
				(m: any) => m.id === matchId
			);
			if (matchIndex === -1) {
				await adminClient
					.from("sessions")
					.update({ recalc_status: "failed" })
					.eq("id", sessionId);
				return NextResponse.json(
					{ error: "Match not found in session" },
					{ status: 404 }
				);
			}

			const matchToEdit = allMatches[matchIndex] as any;
			// Note: Both singles and doubles matches can be edited
			// The replay logic will only recalculate matches of the same type

			// Note: We replay only matches of the same type as the edited match
			// This ensures we only recalculate the relevant Elo system (singles or doubles)
			// The actual filtering happens in the replay loop below
			const matchIdsToReplay = allMatches
				.filter((m: any) => m.match_type === matchToEdit.match_type)
				.map((m: any) => m.id);

			// Preserve scores before resetting (needed for replay)
			const preservedScores = new Map<
				string,
				{ team1Score: number; team2Score: number }
			>();
			for (const match of allMatches) {
				const m = match as any;
				if (m.team1_score !== null && m.team2_score !== null) {
					preservedScores.set(m.id, {
						team1Score: m.team1_score,
						team2Score: m.team2_score,
					});
				}
			}

			// CRITICAL: Calculate baseline BEFORE deleting history
			// We need match_elo_history to reverse session changes for baseline calculation
			// Step 2.5: Load baseline for all players (before deleting history)
			// Collect unique player IDs from current session matches only (singles + doubles)
			const allPlayerIds = new Set<string>();
			for (const match of allMatches) {
				const playerIds = (match as any).player_ids as string[];
				if ((match as any).match_type === "singles") {
					allPlayerIds.add(playerIds[0]);
					allPlayerIds.add(playerIds[1]);
				} else if ((match as any).match_type === "doubles") {
					// Doubles: 4 players
					if (playerIds.length >= 4) {
						allPlayerIds.add(playerIds[0]);
						allPlayerIds.add(playerIds[1]);
						allPlayerIds.add(playerIds[2]);
						allPlayerIds.add(playerIds[3]);
					}
				}
			}

			// Load baseline state (will be used after history deletion)
			const baselineState = new Map<
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
			>();

			// CRITICAL: Only calculate baseline for players in matches of the edited match type
			// If editing doubles, only calculate baseline for players in doubles matches
			// If editing singles, only calculate baseline for players in singles matches
			// This prevents reversing matches that won't be replayed
			const playersInEditedMatchType = new Set<string>();
			for (const match of allMatches) {
				const playerIds = (match as any).player_ids as string[];
				const matchType = (match as any).match_type as string;
				if (matchType === matchToEdit.match_type) {
					if (matchType === "singles") {
						playersInEditedMatchType.add(playerIds[0]);
						playersInEditedMatchType.add(playerIds[1]);
					} else if (matchType === "doubles") {
						if (playerIds.length >= 4) {
							playersInEditedMatchType.add(playerIds[0]);
							playersInEditedMatchType.add(playerIds[1]);
							playersInEditedMatchType.add(playerIds[2]);
							playersInEditedMatchType.add(playerIds[3]);
						}
					}
				}
			}

			console.log(
				JSON.stringify({
					tag: "[BASELINE_SCOPE]",
					session_id: sessionId,
					edited_match_type: matchToEdit.match_type,
					all_players_in_session: Array.from(allPlayerIds),
					players_in_edited_match_type: Array.from(
						playersInEditedMatchType
					),
					players_excluded_from_baseline: Array.from(
						allPlayerIds
					).filter((p) => !playersInEditedMatchType.has(p)),
					message:
						"Only calculating baseline for players in matches of the edited match type",
				})
			);

			// Load baseline from previous session snapshot for each player
			// CRITICAL: Only calculate baseline for players in matches of the edited match type
			// Baseline selection order:
			// 1. Session N-1 snapshot (if exists)
			// 2. Current session snapshot (if exists - created at session start)
			// 3. Calculate from current rating by reversing this session's matches (using match_elo_history)
			// 4. Initial baseline (1500/0) - only for truly new players
			for (const playerId of playersInEditedMatchType) {
				// Step 1: Try to get snapshot from previous session
				const previousSnapshot = await getPreviousSessionSnapshot(
					playerId,
					sessionId
				);

				if (previousSnapshot) {
					// Use snapshot from Session N-1
					baselineState.set(playerId, { ...previousSnapshot });
					console.log(
						JSON.stringify({
							tag: "[BASELINE_LOADED]",
							session_id: sessionId,
							player_id: playerId,
							source: "session_n_minus_1_snapshot",
							baseline: previousSnapshot,
						})
					);
					continue;
				}

				// Step 2: No previous session snapshot - check if there's a snapshot for THIS session
				// (created at session start, before any matches)
				const { data: currentSessionSnapshot } = await adminClient
					.from("session_rating_snapshots")
					.select(
						"elo, matches_played, wins, losses, draws, sets_won, sets_lost"
					)
					.eq("session_id", sessionId)
					.eq("entity_type", "player_singles")
					.eq("entity_id", playerId)
					.single();

				if (currentSessionSnapshot) {
					// Use snapshot from current session start
					const snapshotElo =
						typeof currentSessionSnapshot.elo === "string"
							? parseFloat(currentSessionSnapshot.elo)
							: Number(currentSessionSnapshot.elo);

					baselineState.set(playerId, {
						elo: snapshotElo,
						matches_played: currentSessionSnapshot.matches_played,
						wins: currentSessionSnapshot.wins,
						losses: currentSessionSnapshot.losses,
						draws: currentSessionSnapshot.draws,
						sets_won: currentSessionSnapshot.sets_won,
						sets_lost: currentSessionSnapshot.sets_lost,
					});
					console.log(
						JSON.stringify({
							tag: "[BASELINE_LOADED]",
							session_id: sessionId,
							player_id: playerId,
							source: "session_start_snapshot",
							baseline: {
								elo: snapshotElo,
								matches_played:
									currentSessionSnapshot.matches_played,
								wins: currentSessionSnapshot.wins,
								losses: currentSessionSnapshot.losses,
								draws: currentSessionSnapshot.draws,
							},
						})
					);
					continue;
				}

				// Step 3: No snapshot - calculate baseline by reversing this session's matches
				// CRITICAL: This must happen BEFORE deleting match_elo_history
				// Get current player rating
				const { data: currentRating } = await adminClient
					.from("player_ratings")
					.select(
						"elo, matches_played, wins, losses, draws, sets_won, sets_lost"
					)
					.eq("player_id", playerId)
					.single();

				if (currentRating) {
					// Player exists - calculate baseline by reversing this session's matches
					// Get all Elo history entries for this session for this player
					// NOTE: We're querying BEFORE deletion, so history still exists
					const { data: sessionEloHistory } = await adminClient
						.from("match_elo_history")
						.select(
							"player1_id, player2_id, player1_elo_delta, player2_elo_delta, match_id"
						)
						.in("match_id", matchIdsToReplay)
						.or(
							`player1_id.eq.${playerId},player2_id.eq.${playerId}`
						);

					// Get session matches to count wins/losses/draws
					const sessionMatchesForBaseline = allMatches.filter(
						(m: any) => m.match_type === matchToEdit.match_type
					);

					let sessionEloDelta = 0;
					let sessionMatchesPlayed = 0;
					let sessionWins = 0;
					let sessionLosses = 0;
					let sessionDraws = 0;
					let sessionSetsWon = 0;
					let sessionSetsLost = 0;

					if (sessionEloHistory) {
						for (const history of sessionEloHistory) {
							const isPlayer1 = history.player1_id === playerId;
							const delta = isPlayer1
								? history.player1_elo_delta
								: history.player2_elo_delta;

							if (delta !== null && delta !== undefined) {
								const deltaNum =
									typeof delta === "string"
										? parseFloat(delta)
										: Number(delta);
								sessionEloDelta += deltaNum;
							}
						}
					}

					// Count matches and wins/losses/draws from session matches
					for (const match of sessionMatchesForBaseline) {
						const playerIds = (match as any).player_ids as string[];
						if (playerIds.includes(playerId)) {
							sessionMatchesPlayed += 1;
							const playerIndex = playerIds.indexOf(playerId);
							const playerScore =
								playerIndex === 0
									? match.team1_score
									: match.team2_score;
							const opponentScore =
								playerIndex === 0
									? match.team2_score
									: match.team1_score;

							if (
								playerScore !== null &&
								opponentScore !== null
							) {
								if (playerScore > opponentScore) {
									sessionWins += 1;
									sessionSetsWon += 1;
								} else if (playerScore < opponentScore) {
									sessionLosses += 1;
									sessionSetsLost += 1;
								} else {
									sessionDraws += 1;
								}
							}
						}
					}

					// Calculate baseline by reversing session changes
					const currentElo =
						typeof currentRating.elo === "string"
							? parseFloat(currentRating.elo)
							: Number(currentRating.elo);

					const baselineElo = currentElo - sessionEloDelta;
					const baselineMatchesPlayed =
						(currentRating.matches_played ?? 0) -
						sessionMatchesPlayed;
					const baselineWins = Math.max(
						0,
						(currentRating.wins ?? 0) - sessionWins
					);
					const baselineLosses = Math.max(
						0,
						(currentRating.losses ?? 0) - sessionLosses
					);
					const baselineDraws = Math.max(
						0,
						(currentRating.draws ?? 0) - sessionDraws
					);
					const baselineSetsWon = Math.max(
						0,
						(currentRating.sets_won ?? 0) - sessionSetsWon
					);
					const baselineSetsLost = Math.max(
						0,
						(currentRating.sets_lost ?? 0) - sessionSetsLost
					);

					baselineState.set(playerId, {
						elo: baselineElo,
						matches_played: Math.max(0, baselineMatchesPlayed),
						wins: baselineWins,
						losses: baselineLosses,
						draws: baselineDraws,
						sets_won: baselineSetsWon,
						sets_lost: baselineSetsLost,
					});
					console.log(
						JSON.stringify({
							tag: "[BASELINE_LOADED]",
							session_id: sessionId,
							player_id: playerId,
							source: "session_start_rating_calculated",
							baseline: {
								elo: baselineElo,
								matches_played: Math.max(
									0,
									baselineMatchesPlayed
								),
								wins: baselineWins,
								losses: baselineLosses,
								draws: baselineDraws,
							},
							current_rating: {
								elo: currentElo,
								matches_played: currentRating.matches_played,
								wins: currentRating.wins,
								losses: currentRating.losses,
								draws: currentRating.draws,
							},
							session_changes_reversed: {
								elo_delta: -sessionEloDelta,
								matches_played: -sessionMatchesPlayed,
								wins: -sessionWins,
								losses: -sessionLosses,
								draws: -sessionDraws,
							},
						})
					);
					continue;
				}

				// Step 4: Player doesn't exist in player_ratings - truly new player
				// Use initial baseline (1500/0)
				baselineState.set(playerId, {
					elo: 1500,
					matches_played: 0,
					wins: 0,
					losses: 0,
					draws: 0,
					sets_won: 0,
					sets_lost: 0,
				});
				console.log(
					JSON.stringify({
						tag: "[BASELINE_LOADED]",
						session_id: sessionId,
						player_id: playerId,
						source: "initial_baseline",
						baseline: {
							elo: 1500,
							matches_played: 0,
							wins: 0,
							losses: 0,
							draws: 0,
							sets_won: 0,
							sets_lost: 0,
						},
					})
				);
			}

			// Log baseline state
			const baselineLog: any[] = [];
			for (const [playerId, baseline] of baselineState.entries()) {
				baselineLog.push({
					player_id: playerId,
					elo: baseline.elo,
					matches_played: baseline.matches_played,
					wins: baseline.wins,
					losses: baseline.losses,
					draws: baseline.draws,
				});
			}
			console.log(
				JSON.stringify({
					tag: "[BASELINE]",
					session_id: sessionId,
					baseline_state: baselineLog,
				})
			);

			// Step 3: Delete elo_snapshots for edited match and all matches after it (if using per-match snapshots)
			// Note: We're using session-level snapshots, but clean up per-match snapshots for consistency
			const { count: snapshotsBeforeDelete } = await adminClient
				.from("elo_snapshots")
				.select("*", { count: "exact", head: true })
				.in("match_id", matchIdsToReplay);

			const { error: deleteSnapshotsError } = await adminClient
				.from("elo_snapshots")
				.delete()
				.in("match_id", matchIdsToReplay);

			if (deleteSnapshotsError) {
				console.error(
					"Error deleting snapshots:",
					deleteSnapshotsError
				);
				await adminClient
					.from("sessions")
					.update({ recalc_status: "failed" })
					.eq("id", sessionId);
				return NextResponse.json(
					{ error: "Failed to delete snapshots" },
					{ status: 500 }
				);
			}

			const { count: snapshotsAfterDelete } = await adminClient
				.from("elo_snapshots")
				.select("*", { count: "exact", head: true })
				.in("match_id", matchIdsToReplay);

			// 3️⃣ RESET CONFIRMATION LOG
			console.log(
				JSON.stringify({
					tag: "[RESET]",
					session_id: sessionId,
					cleared_snapshots: true,
					snapshots_before: snapshotsBeforeDelete || 0,
					snapshots_after: snapshotsAfterDelete || 0,
					matches_to_replay: matchIdsToReplay.length,
					match_ids_to_replay: matchIdsToReplay,
				})
			);

			// Step 4: Delete Elo history for matches to be replayed
			const { error: deleteHistoryError } = await adminClient
				.from("match_elo_history")
				.delete()
				.in("match_id", matchIdsToReplay);

			if (deleteHistoryError) {
				console.error(
					"Error deleting Elo history:",
					deleteHistoryError
				);
				await adminClient
					.from("sessions")
					.update({ recalc_status: "failed" })
					.eq("id", sessionId);
				return NextResponse.json(
					{ error: "Failed to reset Elo history" },
					{ status: 500 }
				);
			}

			// Log which players are in replay vs all players
			// NOTE: Baseline was already loaded above (before history deletion)
			const playersInReplay = new Set<string>();
			for (const match of allMatches) {
				const playerIds = (match as any).player_ids as string[];
				const matchType = (match as any).match_type as string;
				// Only count players in matches of the same type as edited match
				if (matchType === matchToEdit.match_type) {
					if (matchType === "singles") {
						playersInReplay.add(playerIds[0]);
						playersInReplay.add(playerIds[1]);
					} else if (matchType === "doubles") {
						if (playerIds.length >= 4) {
							playersInReplay.add(playerIds[0]);
							playersInReplay.add(playerIds[1]);
							playersInReplay.add(playerIds[2]);
							playersInReplay.add(playerIds[3]);
						}
					}
				}
			}
			console.log(
				JSON.stringify({
					tag: "[PLAYER_COLLECTION]",
					session_id: sessionId,
					all_players_in_session: Array.from(allPlayerIds),
					players_in_replay_matches: Array.from(playersInReplay),
					players_not_in_replay: Array.from(allPlayerIds).filter(
						(p) => !playersInReplay.has(p)
					),
				})
			);

			// Step 6: Replay matches forward from Session N baseline, updating Elo in memory
			// CRITICAL: We replay ONLY matches from current session (Session N), starting from match 1
			// We do NOT replay matches from earlier sessions
			const currentState = new Map<
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
			>();

			// Track team state for doubles matches (only initialized when doubles match is encountered)
			const teamState = new Map<
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
			>();

			// Track player doubles state (only initialized when doubles match is encountered)
			const playerDoublesState = new Map<
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
			>();

			// Flag to track if any doubles matches were replayed
			// Only persist doubles data if this is true
			let replayedAnyDoublesMatches = false;

			// Initialize current state from baseline (Session N-1 snapshot or initial baseline)
			// CRITICAL: Only initialize for players in matches of the edited match type
			// If editing doubles, do NOT initialize singles players in currentState
			// NOTE: Do NOT initialize playerDoublesState here - only initialize when a doubles match is encountered
			for (const [playerId, baseline] of baselineState.entries()) {
				// baselineState only contains players in the edited match type
				currentState.set(playerId, { ...baseline });
			}

			// Load baseline for teams from previous session snapshot
			// For teams, we need to check if they existed in previous session
			// If not, initialize at 1500
			const allTeamIds = new Set<string>();
			for (const match of allMatches) {
				if ((match as any).match_type === "doubles") {
					const playerIds = (match as any).player_ids as string[];
					if (playerIds.length >= 4) {
						// Get or create team IDs (we'll do this during replay, but collect pairs now)
						// For baseline, we'll load team ratings from DB if they exist
					}
				}
			}

			console.log(
				JSON.stringify({
					tag: "[CURRENT_STATE_INITIALIZED]",
					session_id: sessionId,
					players_initialized: Array.from(currentState.keys()),
					state: Array.from(currentState.entries()).map(
						([id, state]) => ({
							player_id: id,
							elo: state.elo,
							matches_played: state.matches_played,
							wins: state.wins,
							losses: state.losses,
							draws: state.draws,
						})
					),
				})
			);

			const eloHistoryEntries: Array<{
				match_id: string;
				player1_id?: string;
				player2_id?: string;
				player1_elo_before?: number;
				player1_elo_after?: number;
				player1_elo_delta?: number;
				player2_elo_before?: number;
				player2_elo_after?: number;
				player2_elo_delta?: number;
				team1_id?: string;
				team2_id?: string;
				team1_elo_before?: number;
				team1_elo_after?: number;
				team1_elo_delta?: number;
				team2_elo_before?: number;
				team2_elo_after?: number;
				team2_elo_delta?: number;
			}> = [];

			// Track replayed matches for duplicate detection
			const replayedMatchIds = new Set<string>();

			// Track which players/teams were actually replayed (for persistence scoping)
			const replayedPlayerIds = new Set<string>();
			const replayedTeamIds = new Set<string>();
			// Track players who participated in replayed doubles matches
			// (for doubles player persistence - they're derived, not directly replayed)
			const playersInReplayedDoublesMatches = new Set<string>();

			// Determine the type of the edited match
			// CRITICAL: We only replay matches of the SAME TYPE as the edited match
			// Singles matches affect only singles Elo (player_ratings)
			// Doubles matches affect only doubles Elo (double_team_ratings, player_double_ratings)
			// These are independent systems, so editing one type should not recalculate the other
			const editedMatchType = (matchToEdit as any).match_type as
				| "singles"
				| "doubles";

			console.log(
				JSON.stringify({
					tag: "[REPLAY_TYPE_FILTER]",
					session_id: sessionId,
					edited_match_id: matchId,
					edited_match_type: editedMatchType,
					total_matches_in_session: allMatches.length,
					message:
						"Only replaying matches of the same type as the edited match",
				})
			);

			// Process matches sequentially from current session
			// CRITICAL: We replay ONLY matches of the same type as the edited match
			// This ensures we recalculate only the relevant Elo system
			// We do NOT replay matches from earlier sessions
			// We do NOT replay matches of a different type
			for (let i = 0; i < allMatches.length; i++) {
				const match = allMatches[i] as any;
				const playerIds = match.player_ids as string[];
				const matchType = (match as any).match_type as
					| "singles"
					| "doubles";

				// Skip matches of a different type than the edited match
				if (matchType !== editedMatchType) {
					console.log(
						JSON.stringify({
							tag: "[REPLAY_SKIPPED]",
							session_id: sessionId,
							match_id: match.id,
							match_type: matchType,
							edited_match_type: editedMatchType,
							reason: "Match type does not match edited match type",
						})
					);
					continue;
				}

				// 5️⃣ DUPLICATE DETECTION
				if (replayedMatchIds.has(match.id)) {
					console.error(
						JSON.stringify({
							tag: "[ERROR]",
							session_id: sessionId,
							message: `Match ${match.id} replayed more than once`,
							match_id: match.id,
						})
					);
					continue;
				}
				replayedMatchIds.add(match.id);

				// Get scores: use new scores for edited match, existing scores for others
				let score1: number;
				let score2: number;

				if (match.id === matchId) {
					// Edited match - use new scores
					score1 = team1Score;
					score2 = team2Score;
				} else {
					// Other matches in current session - use preserved scores
					const preserved = preservedScores.get(match.id);
					if (!preserved) {
						// If no preserved scores, use stored scores
						if (
							match.team1_score === null ||
							match.team2_score === null
						) {
							console.warn(
								`Match ${match.id} has no scores, skipping`
							);
							continue;
						}
						score1 = match.team1_score;
						score2 = match.team2_score;
					} else {
						score1 = preserved.team1Score;
						score2 = preserved.team2Score;
					}
				}

				// Handle singles vs doubles matches
				if (matchType === "singles") {
					// SINGLES MATCH HANDLING
					// Get current state from memory (NOT from DB)
					const player1State = currentState.get(playerIds[0])!;
					const player2State = currentState.get(playerIds[1])!;

					const player1EloBefore = player1State.elo;
					const player2EloBefore = player2State.elo;
					const player1MatchesPlayedBefore =
						player1State.matches_played;
					const player2MatchesPlayedBefore =
						player2State.matches_played;

					// Calculate Elo delta using K-factor based on matches_played from memory
					// Use calculateEloDelta() to ensure consistent calculation and preserve decimal precision
					const player1Result: MatchResult =
						score1 > score2
							? "win"
							: score1 < score2
							? "loss"
							: "draw";
					const player2Result: MatchResult =
						score2 > score1
							? "win"
							: score2 < score1
							? "loss"
							: "draw";

					// Calculate K-factors and expected scores for logging
					const player1K = calculateKFactor(
						player1MatchesPlayedBefore
					);
					const player2K = calculateKFactor(
						player2MatchesPlayedBefore
					);
					const player1Expected = calculateExpectedScore(
						player1EloBefore,
						player2EloBefore
					);
					const player2Expected = calculateExpectedScore(
						player2EloBefore,
						player1EloBefore
					);
					const player1Actual = getActualScore(player1Result);
					const player2Actual = getActualScore(player2Result);

					const player1Delta = calculateEloDelta(
						player1EloBefore,
						player2EloBefore,
						player1Result,
						player1MatchesPlayedBefore
					);
					const player2Delta = calculateEloDelta(
						player2EloBefore,
						player1EloBefore,
						player2Result,
						player2MatchesPlayedBefore
					);

					// 4️⃣ PER-MATCH REPLAY - Before update
					console.log(
						JSON.stringify({
							tag: "[MATCH_REPLAY]",
							session_id: sessionId,
							match_index: i,
							match_id: match.id,
							match_type: "singles",
							players: [playerIds[0], playerIds[1]],
							scores: { team1: score1, team2: score2 },
							pre: {
								player1: {
									id: playerIds[0],
									elo: player1EloBefore,
									matches_played: player1MatchesPlayedBefore,
									wins: player1State.wins,
									losses: player1State.losses,
									draws: player1State.draws,
								},
								player2: {
									id: playerIds[1],
									elo: player2EloBefore,
									matches_played: player2MatchesPlayedBefore,
									wins: player2State.wins,
									losses: player2State.losses,
									draws: player2State.draws,
								},
							},
							calculation: {
								player1: {
									K: player1K,
									expected_score: player1Expected,
									actual_score: player1Actual,
									result: player1Result,
									delta: player1Delta,
								},
								player2: {
									K: player2K,
									expected_score: player2Expected,
									actual_score: player2Actual,
									result: player2Result,
									delta: player2Delta,
								},
							},
						})
					);

					// Update state in memory
					player1State.elo += player1Delta;
					player2State.elo += player2Delta;
					player1State.matches_played += 1;
					player2State.matches_played += 1;

					if (player1Result === "win") {
						player1State.wins += 1;
						player2State.losses += 1;
					} else if (player1Result === "loss") {
						player1State.losses += 1;
						player2State.wins += 1;
					} else {
						player1State.draws += 1;
						player2State.draws += 1;
					}

					if (score1 > score2) {
						player1State.sets_won += 1;
						player2State.sets_lost += 1;
					} else if (score1 < score2) {
						player1State.sets_lost += 1;
						player2State.sets_won += 1;
					}

					const player1EloAfter = player1State.elo;
					const player2EloAfter = player2State.elo;

					// 4️⃣ PER-MATCH REPLAY - After update
					console.log(
						JSON.stringify({
							tag: "[MATCH_REPLAY]",
							session_id: sessionId,
							match_index: i,
							match_id: match.id,
							post: {
								player1: {
									id: playerIds[0],
									elo: player1EloAfter,
									matches_played: player1State.matches_played,
									wins: player1State.wins,
									losses: player1State.losses,
									draws: player1State.draws,
									delta: player1Delta,
								},
								player2: {
									id: playerIds[1],
									elo: player2EloAfter,
									matches_played: player2State.matches_played,
									wins: player2State.wins,
									losses: player2State.losses,
									draws: player2State.draws,
									delta: player2Delta,
								},
							},
						})
					);

					// Note: We're using session-level snapshots, not per-match snapshots
					// Per-match snapshots (elo_snapshots) are optional and can be created for debugging

					// Store history entry
					eloHistoryEntries.push({
						match_id: match.id,
						player1_id: playerIds[0],
						player2_id: playerIds[1],
						player1_elo_before: player1EloBefore,
						player1_elo_after: player1EloAfter,
						player1_elo_delta: player1Delta,
						player2_elo_before: player2EloBefore,
						player2_elo_after: player2EloAfter,
						player2_elo_delta: player2Delta,
					});

					// Update match status and scores
					await adminClient
						.from("session_matches")
						.update({
							status: "completed",
							team1_score: score1,
							team2_score: score2,
							is_edited:
								match.id === matchId
									? true
									: (match as any).is_edited,
							edited_at:
								match.id === matchId
									? new Date().toISOString()
									: (match as any).edited_at,
							edited_by:
								match.id === matchId
									? user.id
									: (match as any).edited_by,
							edit_reason:
								match.id === matchId
									? reason
									: (match as any).edit_reason,
						})
						.eq("id", match.id);
				} else if (matchType === "doubles") {
					// DOUBLES MATCH HANDLING
					// Set flag to indicate we're replaying doubles matches
					replayedAnyDoublesMatches = true;

					if (playerIds.length < 4) {
						console.error(
							JSON.stringify({
								tag: "[ERROR]",
								session_id: sessionId,
								match_id: match.id,
								message: "Doubles match must have 4 players",
								player_count: playerIds.length,
							})
						);
						continue;
					}

					// Get or create team IDs
					const team1Id = await getOrCreateDoubleTeam(
						playerIds[0],
						playerIds[1]
					);
					const team2Id = await getOrCreateDoubleTeam(
						playerIds[2],
						playerIds[3]
					);

					// Track replayed teams for persistence scoping
					replayedTeamIds.add(team1Id);
					replayedTeamIds.add(team2Id);

					// Track all players in this replayed doubles match
					// CRITICAL: These players must have their doubles Elo persisted
					// even though they're not in replayedPlayerIds (which is for singles)
					for (const playerId of playerIds) {
						playersInReplayedDoublesMatches.add(playerId);
					}

					// Initialize team state from scratch (session-scoped recomputation)
					// CRITICAL: NEVER read team Elo from database during replay
					// All teams start at 1500/0/0/0/0 for this session
					// This ensures mathematical correctness and prevents double counting
					if (!teamState.has(team1Id)) {
						teamState.set(team1Id, {
							elo: 1500,
							matches_played: 0,
							wins: 0,
							losses: 0,
							draws: 0,
							sets_won: 0,
							sets_lost: 0,
						});

						console.log(
							JSON.stringify({
								tag: "[TEAM_INITIALIZED]",
								session_id: sessionId,
								team_id: team1Id,
								source: "session_scoped_recomputation",
								initial_state: {
									elo: 1500,
									matches_played: 0,
									wins: 0,
									losses: 0,
									draws: 0,
								},
								message:
									"Team initialized at 1500 for session-scoped recomputation",
							})
						);
					}

					if (!teamState.has(team2Id)) {
						teamState.set(team2Id, {
							elo: 1500,
							matches_played: 0,
							wins: 0,
							losses: 0,
							draws: 0,
							sets_won: 0,
							sets_lost: 0,
						});

						console.log(
							JSON.stringify({
								tag: "[TEAM_INITIALIZED]",
								session_id: sessionId,
								team_id: team2Id,
								source: "session_scoped_recomputation",
								initial_state: {
									elo: 1500,
									matches_played: 0,
									wins: 0,
									losses: 0,
									draws: 0,
								},
								message:
									"Team initialized at 1500 for session-scoped recomputation",
							})
						);
					}

					// Initialize player doubles state from scratch (session-scoped recomputation)
					// CRITICAL: NEVER read player doubles Elo from database during replay
					// Player doubles Elo is derived ONLY from replayed team Elo deltas
					// All players start at 1500/0/0/0/0 for this session
					for (const playerId of playerIds) {
						if (!playerDoublesState.has(playerId)) {
							playerDoublesState.set(playerId, {
								elo: 1500,
								matches_played: 0,
								wins: 0,
								losses: 0,
								draws: 0,
								sets_won: 0,
								sets_lost: 0,
							});

							console.log(
								JSON.stringify({
									tag: "[PLAYER_DOUBLES_INITIALIZED]",
									session_id: sessionId,
									player_id: playerId,
									source: "session_scoped_recomputation",
									initial_state: {
										elo: 1500,
										matches_played: 0,
										wins: 0,
										losses: 0,
										draws: 0,
									},
									message:
										"Player doubles initialized at 1500, will be updated from team deltas during replay",
								})
							);
						}
					}

					const team1State = teamState.get(team1Id)!;
					const team2State = teamState.get(team2Id)!;

					const team1EloBefore = team1State.elo;
					const team2EloBefore = team2State.elo;
					const team1MatchesPlayedBefore = team1State.matches_played;
					const team2MatchesPlayedBefore = team2State.matches_played;

					// Determine results
					const team1Result: MatchResult =
						score1 > score2
							? "win"
							: score1 < score2
							? "loss"
							: "draw";
					const team2Result: MatchResult =
						score2 > score1
							? "win"
							: score2 < score1
							? "loss"
							: "draw";

					// Calculate team Elo deltas using team Elo from memory
					const team1Delta = calculateEloDelta(
						team1EloBefore,
						team2EloBefore,
						team1Result,
						team1MatchesPlayedBefore
					);
					const team2Delta = calculateEloDelta(
						team2EloBefore,
						team1EloBefore,
						team2Result,
						team2MatchesPlayedBefore
					);

					// Calculate K-factors and expected scores for logging
					const team1K = calculateKFactor(team1MatchesPlayedBefore);
					const team2K = calculateKFactor(team2MatchesPlayedBefore);
					const team1Expected = calculateExpectedScore(
						team1EloBefore,
						team2EloBefore
					);
					const team2Expected = calculateExpectedScore(
						team2EloBefore,
						team1EloBefore
					);
					const team1Actual = getActualScore(team1Result);
					const team2Actual = getActualScore(team2Result);

					// 4️⃣ PER-MATCH REPLAY - Before update (doubles)
					console.log(
						JSON.stringify({
							tag: "[MATCH_REPLAY]",
							session_id: sessionId,
							match_index: i,
							match_id: match.id,
							match_type: "doubles",
							teams: {
								team1: {
									id: team1Id,
									players: [playerIds[0], playerIds[1]],
								},
								team2: {
									id: team2Id,
									players: [playerIds[2], playerIds[3]],
								},
							},
							scores: { team1: score1, team2: score2 },
							pre: {
								team1: {
									id: team1Id,
									elo: team1EloBefore,
									matches_played: team1MatchesPlayedBefore,
									wins: team1State.wins,
									losses: team1State.losses,
									draws: team1State.draws,
								},
								team2: {
									id: team2Id,
									elo: team2EloBefore,
									matches_played: team2MatchesPlayedBefore,
									wins: team2State.wins,
									losses: team2State.losses,
									draws: team2State.draws,
								},
							},
							calculation: {
								team1: {
									K: team1K,
									expected_score: team1Expected,
									actual_score: team1Actual,
									result: team1Result,
									delta: team1Delta,
								},
								team2: {
									K: team2K,
									expected_score: team2Expected,
									actual_score: team2Actual,
									result: team2Result,
									delta: team2Delta,
								},
							},
						})
					);

					// Update team state in memory
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

					if (score1 > score2) {
						team1State.sets_won += 1;
						team2State.sets_lost += 1;
					} else if (score1 < score2) {
						team1State.sets_lost += 1;
						team2State.sets_won += 1;
					}

					const team1EloAfter = team1State.elo;
					const team2EloAfter = team2State.elo;

					// Update player doubles state (each player gets the same team delta)
					// Team 1 players
					const player1DoublesState = playerDoublesState.get(
						playerIds[0]
					)!;
					const player2DoublesState = playerDoublesState.get(
						playerIds[1]
					)!;
					player1DoublesState.elo += team1Delta;
					player2DoublesState.elo += team1Delta;
					player1DoublesState.matches_played += 1;
					player2DoublesState.matches_played += 1;
					if (team1Result === "win") {
						player1DoublesState.wins += 1;
						player2DoublesState.wins += 1;
					} else if (team1Result === "loss") {
						player1DoublesState.losses += 1;
						player2DoublesState.losses += 1;
					} else {
						player1DoublesState.draws += 1;
						player2DoublesState.draws += 1;
					}
					if (score1 > score2) {
						player1DoublesState.sets_won += 1;
						player2DoublesState.sets_won += 1;
					} else if (score1 < score2) {
						player1DoublesState.sets_lost += 1;
						player2DoublesState.sets_lost += 1;
					}

					// Team 2 players
					const player3DoublesState = playerDoublesState.get(
						playerIds[2]
					)!;
					const player4DoublesState = playerDoublesState.get(
						playerIds[3]
					)!;
					player3DoublesState.elo += team2Delta;
					player4DoublesState.elo += team2Delta;
					player3DoublesState.matches_played += 1;
					player4DoublesState.matches_played += 1;
					if (team2Result === "win") {
						player3DoublesState.wins += 1;
						player4DoublesState.wins += 1;
					} else if (team2Result === "loss") {
						player3DoublesState.losses += 1;
						player4DoublesState.losses += 1;
					} else {
						player3DoublesState.draws += 1;
						player4DoublesState.draws += 1;
					}
					if (score2 > score1) {
						player3DoublesState.sets_won += 1;
						player4DoublesState.sets_won += 1;
					} else if (score2 < score1) {
						player3DoublesState.sets_lost += 1;
						player4DoublesState.sets_lost += 1;
					}

					// 4️⃣ PER-MATCH REPLAY - After update (doubles)
					console.log(
						JSON.stringify({
							tag: "[MATCH_REPLAY]",
							session_id: sessionId,
							match_index: i,
							match_id: match.id,
							match_type: "doubles",
							post: {
								team1: {
									id: team1Id,
									elo: team1EloAfter,
									matches_played: team1State.matches_played,
									wins: team1State.wins,
									losses: team1State.losses,
									draws: team1State.draws,
									delta: team1Delta,
								},
								team2: {
									id: team2Id,
									elo: team2EloAfter,
									matches_played: team2State.matches_played,
									wins: team2State.wins,
									losses: team2State.losses,
									draws: team2State.draws,
									delta: team2Delta,
								},
							},
						})
					);

					// Create snapshots for all 4 players using in-memory state
					try {
						await createEloSnapshots(
							match.id,
							playerIds,
							"doubles",
							playerDoublesState
						);
					} catch (snapshotError) {
						console.error(
							`Error creating snapshots for doubles match ${match.id}:`,
							snapshotError
						);
						// Non-fatal: log error but don't fail the request
					}

					// Store history entry for doubles
					eloHistoryEntries.push({
						match_id: match.id,
						team1_id: team1Id,
						team2_id: team2Id,
						team1_elo_before: team1EloBefore,
						team1_elo_after: team1EloAfter,
						team1_elo_delta: team1Delta,
						team2_elo_before: team2EloBefore,
						team2_elo_after: team2EloAfter,
						team2_elo_delta: team2Delta,
					});

					// Update match status and scores
					await adminClient
						.from("session_matches")
						.update({
							status: "completed",
							team1_score: score1,
							team2_score: score2,
							team_1_id: team1Id,
							team_2_id: team2Id,
							is_edited:
								match.id === matchId
									? true
									: (match as any).is_edited,
							edited_at:
								match.id === matchId
									? new Date().toISOString()
									: (match as any).edited_at,
							edited_by:
								match.id === matchId
									? user.id
									: (match as any).edited_by,
							edit_reason:
								match.id === matchId
									? reason
									: (match as any).edit_reason,
						})
						.eq("id", match.id);
				} else {
					console.error(
						JSON.stringify({
							tag: "[ERROR]",
							session_id: sessionId,
							match_id: match.id,
							message: `Unknown match type: ${matchType}`,
						})
					);
					continue;
				}
			}

			// Step 7: Persist final state to player_ratings, double_team_ratings, and player_double_ratings
			// CRITICAL: Only persist entities that were actually replayed
			// If editing doubles, only persist doubles entities (teams, player_doubles)
			// If editing singles, only persist singles entities (player_ratings)
			// replayedPlayerIds and replayedTeamIds are tracked during the replay loop above

			console.log(
				JSON.stringify({
					tag: "[PERSISTENCE_SCOPE]",
					session_id: sessionId,
					edited_match_type: editedMatchType,
					replayed_player_ids: Array.from(replayedPlayerIds),
					replayed_team_ids: Array.from(replayedTeamIds),
					message:
						"Only persisting entities that were actually replayed",
				})
			);

			// 6️⃣ FINAL COMPUTED STATE - Before DB write
			const finalComputedState: any[] = [];
			for (const [playerId, state] of currentState.entries()) {
				// Only include players that were actually replayed
				if (replayedPlayerIds.has(playerId)) {
					finalComputedState.push({
						player_id: playerId,
						elo: state.elo,
						matches_played: state.matches_played,
						wins: state.wins,
						losses: state.losses,
						draws: state.draws,
					});
				}
			}

			const finalTeamState: any[] = [];
			if (replayedAnyDoublesMatches) {
				for (const [teamId, state] of teamState.entries()) {
					finalTeamState.push({
						team_id: teamId,
						elo: state.elo,
						matches_played: state.matches_played,
						wins: state.wins,
						losses: state.losses,
						draws: state.draws,
					});
				}
			}

			const finalPlayerDoublesState: any[] = [];
			if (replayedAnyDoublesMatches) {
				for (const [playerId, state] of playerDoublesState.entries()) {
					finalPlayerDoublesState.push({
						player_id: playerId,
						elo: state.elo,
						matches_played: state.matches_played,
						wins: state.wins,
						losses: state.losses,
						draws: state.draws,
					});
				}
			}

			console.log(
				JSON.stringify({
					tag: "[FINAL_COMPUTED]",
					session_id: sessionId,
					singles_state: finalComputedState,
					team_state: finalTeamState,
					player_doubles_state: finalPlayerDoublesState,
					replayed_any_doubles_matches: replayedAnyDoublesMatches,
				})
			);

			// Update player_ratings with final computed state
			// CRITICAL: Only persist players that were actually replayed
			// If editing doubles, do NOT persist singles players (they weren't replayed)
			// If editing singles, only persist singles players
			//
			// NOTE: For session-level snapshots, we write the final computed state directly.
			// The guardrail compares against baseline (not global DB state) to ensure we're
			// not decreasing from the baseline we started with.
			for (const [playerId, state] of currentState.entries()) {
				// Only persist if this player was actually replayed
				if (!replayedPlayerIds.has(playerId)) {
					console.log(
						JSON.stringify({
							tag: "[PERSISTENCE_SKIPPED]",
							session_id: sessionId,
							player_id: playerId,
							reason: "Player was not in replayed matches",
							edited_match_type: editedMatchType,
						})
					);
					continue;
				}
				const { data: beforeState } = await adminClient
					.from("player_ratings")
					.select("elo, matches_played, wins, losses, draws")
					.eq("player_id", playerId)
					.single();

				// Get baseline state for this player (what we started replay from)
				const playerBaseline = baselineState.get(playerId);
				const baselineMatchesPlayed = playerBaseline
					? playerBaseline.matches_played
					: 0;

				// Guardrail: Prevent matches_played from decreasing from baseline
				// This ensures we're not losing matches during replay
				// NOTE: We compare against baseline, not global DB state, because
				// session-level snapshots recalculate from baseline + session matches
				if (state.matches_played < baselineMatchesPlayed) {
					console.error(
						JSON.stringify({
							tag: "[ERROR]",
							session_id: sessionId,
							player_id: playerId,
							message:
								"matches_played would decrease from baseline - aborting",
							baseline_matches: baselineMatchesPlayed,
							computed_matches: state.matches_played,
							global_db_matches: beforeState
								? (beforeState.wins ?? 0) +
								  (beforeState.losses ?? 0) +
								  (beforeState.draws ?? 0)
								: 0,
						})
					);
					await adminClient
						.from("sessions")
						.update({ recalc_status: "failed" })
						.eq("id", sessionId);
					return NextResponse.json(
						{
							error: `Invalid state: matches_played would decrease from baseline for player ${playerId}`,
							details: {
								baseline_matches: baselineMatchesPlayed,
								computed_matches: state.matches_played,
							},
						},
						{ status: 500 }
					);
				}

				await adminClient.from("player_ratings").upsert({
					player_id: playerId,
					elo: state.elo,
					matches_played: state.matches_played,
					wins: state.wins,
					losses: state.losses,
					draws: state.draws,
					sets_won: state.sets_won,
					sets_lost: state.sets_lost,
					updated_at: new Date().toISOString(),
				});

				// Calculate global DB matches for logging (not for guardrail)
				const globalDbMatchesPlayed = beforeState
					? (beforeState.wins ?? 0) +
					  (beforeState.losses ?? 0) +
					  (beforeState.draws ?? 0)
					: 0;

				console.log(
					JSON.stringify({
						tag: "[DB_UPSERT]",
						session_id: sessionId,
						entity_type: "player_singles",
						player_id: playerId,
						baseline: {
							matches_played: baselineMatchesPlayed,
							elo: playerBaseline?.elo ?? 1500,
						},
						before: beforeState
							? {
									elo: beforeState.elo,
									matches_played: globalDbMatchesPlayed,
									wins: beforeState.wins ?? 0,
									losses: beforeState.losses ?? 0,
									draws: beforeState.draws ?? 0,
							  }
							: null,
						after: {
							elo: state.elo,
							matches_played: state.matches_played,
							wins: state.wins,
							losses: state.losses,
							draws: state.draws,
						},
					})
				);
			}

			// Persist team ratings (doubles)
			// ONLY persist if at least one doubles match was replayed
			if (replayedAnyDoublesMatches) {
				for (const [teamId, state] of teamState.entries()) {
					const { data: beforeState } = await adminClient
						.from("double_team_ratings")
						.select("elo, wins, losses, draws")
						.eq("team_id", teamId)
						.maybeSingle();

					// For doubles teams, we don't have baseline snapshots.
					// Teams are initialized from DB or 1500/0, and we write the final computed state.
					// No guardrail needed - teams are recalculated from session matches only.

					await adminClient.from("double_team_ratings").upsert({
						team_id: teamId,
						elo: state.elo,
						matches_played: state.matches_played,
						wins: state.wins,
						losses: state.losses,
						draws: state.draws,
						sets_won: state.sets_won,
						sets_lost: state.sets_lost,
						updated_at: new Date().toISOString(),
					});

					// Calculate global DB matches for logging (not for guardrail)
					const globalDbTeamMatchesPlayed = beforeState
						? (beforeState.wins ?? 0) +
						  (beforeState.losses ?? 0) +
						  (beforeState.draws ?? 0)
						: 0;

					console.log(
						JSON.stringify({
							tag: "[DB_UPSERT]",
							session_id: sessionId,
							entity_type: "double_team",
							team_id: teamId,
							before: beforeState
								? {
										elo: beforeState.elo,
										matches_played:
											globalDbTeamMatchesPlayed,
										wins: beforeState.wins ?? 0,
										losses: beforeState.losses ?? 0,
										draws: beforeState.draws ?? 0,
								  }
								: null,
							after: {
								elo: state.elo,
								matches_played: state.matches_played,
								wins: state.wins,
								losses: state.losses,
								draws: state.draws,
							},
						})
					);
				}
			} else {
				console.log(
					JSON.stringify({
						tag: "[DOUBLES_PERSISTENCE_SKIPPED]",
						session_id: sessionId,
						reason: "No doubles matches were replayed in this session",
						message:
							"Skipping persistence of double_team_ratings and player_double_ratings",
					})
				);
			}

			// Persist player double ratings
			// CRITICAL: Persist ALL players who participated in replayed doubles matches
			// Player doubles Elo is derived from team deltas, so players are not in replayedPlayerIds
			// Source of truth: playersInReplayedDoublesMatches (collected during replay)
			// ONLY persist if at least one doubles match was replayed
			if (replayedAnyDoublesMatches) {
				for (const [playerId, state] of playerDoublesState.entries()) {
					// Persist if this player participated in any replayed doubles match
					if (!playersInReplayedDoublesMatches.has(playerId)) {
						console.log(
							JSON.stringify({
								tag: "[PERSISTENCE_SKIPPED]",
								session_id: sessionId,
								player_id: playerId,
								reason: "Player did not participate in any replayed doubles matches",
							})
						);
						continue;
					}
					const { data: beforeState } = await adminClient
						.from("player_double_ratings")
						.select("elo, wins, losses, draws")
						.eq("player_id", playerId)
						.maybeSingle();

					// For player doubles, we don't have baseline snapshots in session_rating_snapshots.
					// Player doubles are initialized from DB or 1500/0, and we write the final computed state.
					// No guardrail needed - player doubles are recalculated from session matches only.

					await adminClient.from("player_double_ratings").upsert({
						player_id: playerId,
						elo: state.elo,
						matches_played: state.matches_played,
						wins: state.wins,
						losses: state.losses,
						draws: state.draws,
						sets_won: state.sets_won,
						sets_lost: state.sets_lost,
						updated_at: new Date().toISOString(),
					});

					// Calculate global DB matches for logging (not for guardrail)
					const globalDbPlayerDoublesMatchesPlayed = beforeState
						? (beforeState.wins ?? 0) +
						  (beforeState.losses ?? 0) +
						  (beforeState.draws ?? 0)
						: 0;

					console.log(
						JSON.stringify({
							tag: "[DB_UPSERT]",
							session_id: sessionId,
							entity_type: "player_doubles",
							player_id: playerId,
							before: beforeState
								? {
										elo: beforeState.elo,
										matches_played:
											globalDbPlayerDoublesMatchesPlayed,
										wins: beforeState.wins ?? 0,
										losses: beforeState.losses ?? 0,
										draws: beforeState.draws ?? 0,
								  }
								: null,
							after: {
								elo: state.elo,
								matches_played: state.matches_played,
								wins: state.wins,
								losses: state.losses,
								draws: state.draws,
							},
						})
					);
				}
			} else {
				console.log(
					JSON.stringify({
						tag: "[DOUBLES_PERSISTENCE_SKIPPED]",
						session_id: sessionId,
						reason: "No doubles matches were replayed in this session",
						message:
							"Skipping persistence of player_double_ratings",
					})
				);
			}

			// Step 8: Update Session N snapshot with final computed state
			// CRITICAL: Only update snapshots for players that were actually replayed
			// This overwrites the snapshot for the current session after recalculation
			for (const [playerId, state] of currentState.entries()) {
				// Only update snapshot if this player was actually replayed
				if (!replayedPlayerIds.has(playerId)) {
					continue;
				}
				try {
					await updateSessionSnapshot(sessionId, playerId, state);
					console.log(
						JSON.stringify({
							tag: "[SESSION_SNAPSHOT_UPDATED]",
							session_id: sessionId,
							player_id: playerId,
							state: state,
						})
					);
				} catch (snapshotError) {
					console.error(
						`Error updating session snapshot for player ${playerId}:`,
						snapshotError
					);
					// Continue even if snapshot update fails - ratings are still persisted
				}
			}

			// Insert Elo history
			if (eloHistoryEntries.length > 0) {
				const { error: historyError } = await adminClient
					.from("match_elo_history")
					.insert(eloHistoryEntries);

				if (historyError) {
					console.error("Error inserting Elo history:", historyError);
					await adminClient
						.from("sessions")
						.update({ recalc_status: "failed" })
						.eq("id", sessionId);
					return NextResponse.json(
						{ error: "Failed to insert Elo history" },
						{ status: 500 }
					);
				}
			}

			// 6️⃣ FINAL PERSISTED STATE - After DB write
			const dbPersistedState: any[] = [];
			for (const playerId of allPlayerIds) {
				const { data: rating } = await adminClient
					.from("player_ratings")
					.select("elo, wins, losses, draws")
					.eq("player_id", playerId)
					.single();
				if (rating) {
					dbPersistedState.push({
						player_id: playerId,
						elo: rating.elo,
						matches_played:
							(rating.wins ?? 0) +
							(rating.losses ?? 0) +
							(rating.draws ?? 0),
						wins: rating.wins ?? 0,
						losses: rating.losses ?? 0,
						draws: rating.draws ?? 0,
					});
				}
			}

			console.log(
				JSON.stringify({
					tag: "[DB_PERSISTED]",
					session_id: sessionId,
					state: dbPersistedState,
				})
			);

			// Compare computed vs persisted
			for (const computed of finalComputedState) {
				const persisted = dbPersistedState.find(
					(p) => p.player_id === computed.player_id
				);
				if (persisted) {
					if (
						computed.elo !== persisted.elo ||
						computed.matches_played !== persisted.matches_played
					) {
						console.error(
							JSON.stringify({
								tag: "[ERROR]",
								session_id: sessionId,
								message: "Computed vs persisted mismatch",
								player_id: computed.player_id,
								computed: computed,
								persisted: persisted,
							})
						);
					}
				}
			}

			// Step 8: Release lock
			await adminClient
				.from("sessions")
				.update({
					recalc_status: "done",
					recalc_finished_at: new Date().toISOString(),
					recalc_token: null,
				})
				.eq("id", sessionId);

			return NextResponse.json({
				success: true,
				message: "Match edited and session recalculated successfully",
			});
		} catch (error) {
			console.error("Error during recalculation:", error);
			try {
				await adminClient
					.from("sessions")
					.update({
						recalc_status: "failed",
						recalc_finished_at: new Date().toISOString(),
					})
					.eq("id", sessionId);
			} catch (lockError) {
				console.error("Failed to release lock:", lockError);
			}

			return NextResponse.json(
				{
					error: "Internal server error during recalculation",
					details:
						error instanceof Error ? error.message : String(error),
				},
				{ status: 500 }
			);
		}
	} catch (error) {
		console.error(
			"Unexpected error in POST /api/sessions/[sessionId]/matches/[matchId]/edit:",
			error
		);
		return NextResponse.json(
			{
				error: "Internal server error",
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 }
		);
	}
}
