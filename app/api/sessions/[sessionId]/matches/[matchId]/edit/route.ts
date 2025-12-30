import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
	getPreviousSessionSnapshot,
	updateSessionSnapshot,
} from "@/lib/elo/snapshots";
import {
	calculateEloDelta,
	calculateKFactor,
	calculateExpectedScore,
	getActualScore,
	type MatchResult,
} from "@/lib/elo/calculation";

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
			if (matchToEdit.match_type !== "singles") {
				await adminClient
					.from("sessions")
					.update({ recalc_status: "failed" })
					.eq("id", sessionId);
				return NextResponse.json(
					{
						error: "Only singles matches are supported for editing currently",
					},
					{ status: 400 }
				);
			}

			// Note: We replay ALL matches from current session (Session N), starting from match 1
			// This ensures the entire session is recalculated correctly
			const matchIdsToReplay = allMatches.map((m: any) => m.id);

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

			// Step 5: Load baseline for all players from Session N-1 snapshot
			// Collect unique player IDs from current session matches only
			const allPlayerIds = new Set<string>();
			for (const match of allMatches) {
				if ((match as any).match_type === "singles") {
					const playerIds = (match as any).player_ids as string[];
					allPlayerIds.add(playerIds[0]);
					allPlayerIds.add(playerIds[1]);
				}
			}

			// Log which players are in replay vs all players
			const playersInReplay = new Set<string>();
			for (const match of allMatches) {
				if ((match as any).match_type === "singles") {
					const playerIds = (match as any).player_ids as string[];
					playersInReplay.add(playerIds[0]);
					playersInReplay.add(playerIds[1]);
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

			// Load baseline for each player from Session N-1 snapshot
			// If no snapshot exists, fall back to initial baseline (1500)
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

			// Load baseline from previous session snapshot for each player
			for (const playerId of allPlayerIds) {
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
				} else {
					// Fallback to initial baseline (1500/0)
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
							source: "initial_baseline_fallback",
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
			}

			// 2️⃣ BASELINE STATE LOG
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

			// Initialize current state from baseline (Session N-1 snapshot or initial baseline)
			for (const playerId of allPlayerIds) {
				const baseline = baselineState.get(playerId);
				if (baseline) {
					currentState.set(playerId, { ...baseline });
				} else {
					// Fallback: if no baseline found, use initial baseline
					currentState.set(playerId, {
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
			}> = [];

			// Track replayed matches for duplicate detection
			const replayedMatchIds = new Set<string>();

			// Process matches sequentially from current session
			// CRITICAL: We replay ALL matches from current session (Session N), starting from match 1
			// This ensures we recalculate the entire session correctly
			// We do NOT replay matches from earlier sessions
			for (let i = 0; i < allMatches.length; i++) {
				const match = allMatches[i] as any;
				const playerIds = match.player_ids as string[];

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

				// Get current state from memory (NOT from DB)
				const player1State = currentState.get(playerIds[0])!;
				const player2State = currentState.get(playerIds[1])!;

				const player1EloBefore = player1State.elo;
				const player2EloBefore = player2State.elo;
				const player1MatchesPlayedBefore = player1State.matches_played;
				const player2MatchesPlayedBefore = player2State.matches_played;

				// Calculate Elo delta using K-factor based on matches_played from memory
				// Use calculateEloDelta() to ensure consistent calculation and preserve decimal precision
				const player1Result: MatchResult =
					score1 > score2 ? "win" : score1 < score2 ? "loss" : "draw";
				const player2Result: MatchResult =
					score2 > score1 ? "win" : score2 < score1 ? "loss" : "draw";

				// Calculate K-factors and expected scores for logging
				const player1K = calculateKFactor(player1MatchesPlayedBefore);
				const player2K = calculateKFactor(player2MatchesPlayedBefore);
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
						match_index: matchIndex + i,
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
			}

			// Step 7: Persist final state to player_ratings
			// 6️⃣ FINAL COMPUTED STATE - Before DB write
			const finalComputedState: any[] = [];
			for (const [playerId, state] of currentState.entries()) {
				finalComputedState.push({
					player_id: playerId,
					elo: state.elo,
					matches_played: state.matches_played,
					wins: state.wins,
					losses: state.losses,
					draws: state.draws,
				});
			}

			console.log(
				JSON.stringify({
					tag: "[FINAL_COMPUTED]",
					session_id: sessionId,
					state: finalComputedState,
				})
			);

			// Update player_ratings with final computed state
			// CRITICAL: This contains the state after replaying Session N from Session N-1 baseline
			// The final state = Session N-1 snapshot + all matches from Session N
			// Guardrail: Verify matches_played doesn't decrease (would indicate bug)
			for (const [playerId, state] of currentState.entries()) {
				const { data: beforeState } = await adminClient
					.from("player_ratings")
					.select("elo, matches_played, wins, losses, draws")
					.eq("player_id", playerId)
					.single();

				// Guardrail: Prevent matches_played from decreasing
				const beforeMatchesPlayed = beforeState
					? (beforeState.wins ?? 0) +
					  (beforeState.losses ?? 0) +
					  (beforeState.draws ?? 0)
					: 0;

				if (state.matches_played < beforeMatchesPlayed) {
					console.error(
						JSON.stringify({
							tag: "[ERROR]",
							session_id: sessionId,
							player_id: playerId,
							message: "matches_played would decrease - aborting",
							before: beforeMatchesPlayed,
							after: state.matches_played,
						})
					);
					await adminClient
						.from("sessions")
						.update({ recalc_status: "failed" })
						.eq("id", sessionId);
					return NextResponse.json(
						{
							error: `Invalid state: matches_played would decrease for player ${playerId}`,
							details: {
								before: beforeMatchesPlayed,
								after: state.matches_played,
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

				console.log(
					JSON.stringify({
						tag: "[DB_UPSERT]",
						session_id: sessionId,
						player_id: playerId,
						before: beforeState
							? {
									elo: beforeState.elo,
									matches_played: beforeMatchesPlayed,
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

			// Step 8: Update Session N snapshot with final computed state
			// This overwrites the snapshot for the current session after recalculation
			for (const [playerId, state] of currentState.entries()) {
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
