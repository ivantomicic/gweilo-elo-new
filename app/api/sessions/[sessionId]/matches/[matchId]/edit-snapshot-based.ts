import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSnapshotBeforeMatch, getInitialBaseline, createEloSnapshots } from "@/lib/elo/snapshots";
import { calculateEloDelta, calculateKFactor, calculateExpectedScore, type MatchResult } from "@/lib/elo/calculation";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

/**
 * POST /api/sessions/[sessionId]/matches/[matchId]/edit
 *
 * Edit a match result using snapshot-based recalculation
 *
 * This endpoint:
 * 1. Loads baseline from snapshot before edited match (or initial baseline if first match)
 * 2. Deletes snapshots for edited match and all matches after it
 * 3. Replays matches forward from edited match, updating Elo in memory
 * 4. Creates new snapshots after each replayed match
 * 5. Persists final state to player_ratings
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

		const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
		const { team1Score, team2Score, reason }: { team1Score: number; team2Score: number; reason?: string } = body;

		if (typeof team1Score !== "number" || typeof team2Score !== "number" || isNaN(team1Score) || isNaN(team2Score)) {
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
					{ error: "Recalculation already in progress. Please wait." },
					{ status: 409 }
				);
			}

			console.error("Lock acquisition failed:", lockError);
			return NextResponse.json(
				{ 
					error: "Failed to acquire recalculation lock",
					details: lockError?.message || "Unknown error"
				},
				{ status: 500 }
			);
		}

		try {
			// Step 2: Fetch all matches in session, ordered deterministically
			const { data: allMatches, error: allMatchesError } = await adminClient
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
			const invalidMatches = allMatches.filter(m => 
				m.match_type !== "singles" && m.match_type !== "doubles"
			);
			if (invalidMatches.length > 0) {
				console.error(`Found ${invalidMatches.length} matches with invalid match_type:`, invalidMatches);
				await adminClient
					.from("sessions")
					.update({ recalc_status: "failed" })
					.eq("id", sessionId);
				return NextResponse.json(
					{ error: `Invalid match types found: ${invalidMatches.map(m => m.id).join(", ")}` },
					{ status: 500 }
				);
			}

			const singlesCount = allMatches.filter(m => m.match_type === "singles").length;
			const doublesCount = allMatches.filter(m => m.match_type === "doubles").length;

			// 1️⃣ RECALCULATION ENTRY LOG
			console.log(JSON.stringify({
				tag: "[RECALC_START]",
				session_id: sessionId,
				edited_match_id: matchId,
				total_matches: allMatches.length,
				singles_count: singlesCount,
				doubles_count: doublesCount,
				matches: allMatches.map((m, idx) => ({
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
			}));

			// Find the position of the match to edit
			const matchIndex = allMatches.findIndex((m) => m.id === matchId);
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

			const matchToEdit = allMatches[matchIndex];
			if (matchToEdit.match_type !== "singles") {
				await adminClient
					.from("sessions")
					.update({ recalc_status: "failed" })
					.eq("id", sessionId);
				return NextResponse.json(
					{ error: "Only singles matches are supported for editing currently" },
					{ status: 400 }
				);
			}

			// Get matches to replay (from edited match onward)
			const matchesToReplay = allMatches.slice(matchIndex);
			const matchIdsToReplay = matchesToReplay.map((m) => m.id);

			// Preserve scores before resetting (needed for replay)
			const preservedScores = new Map<string, { team1Score: number; team2Score: number }>();
			for (const match of matchesToReplay) {
				if (match.team1_score !== null && match.team2_score !== null) {
					preservedScores.set(match.id, {
						team1Score: match.team1_score,
						team2Score: match.team2_score,
					});
				}
			}

			// Step 3: Delete snapshots for edited match and all matches after it
			const { count: snapshotsBeforeDelete } = await adminClient
				.from("elo_snapshots")
				.select("*", { count: "exact", head: true })
				.in("match_id", matchIdsToReplay);

			const { error: deleteSnapshotsError } = await adminClient
				.from("elo_snapshots")
				.delete()
				.in("match_id", matchIdsToReplay);

			if (deleteSnapshotsError) {
				console.error("Error deleting snapshots:", deleteSnapshotsError);
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
			console.log(JSON.stringify({
				tag: "[RESET]",
				session_id: sessionId,
				cleared_snapshots: true,
				snapshots_before: snapshotsBeforeDelete || 0,
				snapshots_after: snapshotsAfterDelete || 0,
				matches_to_replay: matchIdsToReplay.length,
				match_ids_to_replay: matchIdsToReplay,
			}));

			// Step 4: Delete Elo history for matches to be replayed
			const { error: deleteHistoryError } = await adminClient
				.from("match_elo_history")
				.delete()
				.in("match_id", matchIdsToReplay);

			if (deleteHistoryError) {
				console.error("Error deleting Elo history:", deleteHistoryError);
				await adminClient
					.from("sessions")
					.update({ recalc_status: "failed" })
					.eq("id", sessionId);
				return NextResponse.json(
					{ error: "Failed to reset Elo history" },
					{ status: 500 }
				);
			}

			// Step 5: Load baseline for all players
			// Collect all unique player IDs from matches to replay
			const allPlayerIds = new Set<string>();
			for (const match of matchesToReplay) {
				if (match.match_type === "singles") {
					const playerIds = match.player_ids as string[];
					allPlayerIds.add(playerIds[0]);
					allPlayerIds.add(playerIds[1]);
				}
			}

			// Load baseline for each player
			const baselineState = new Map<string, {
				elo: number;
				matches_played: number;
				wins: number;
				losses: number;
				draws: number;
				sets_won: number;
				sets_lost: number;
			}>();

			for (const playerId of allPlayerIds) {
				let baseline;
				
				if (matchIndex === 0) {
					// First match - use initial baseline
					baseline = await getInitialBaseline(playerId, sessionId);
					console.log(JSON.stringify({
						tag: "[BASELINE_LOADED]",
						session_id: sessionId,
						player_id: playerId,
						source: "initial_baseline",
						baseline: baseline,
					}));
				} else {
					// Not first match - get snapshot before edited match
					const snapshot = await getSnapshotBeforeMatch(playerId, matchId);
					if (snapshot) {
						baseline = {
							elo: snapshot.elo,
							matches_played: snapshot.matches_played,
							wins: snapshot.wins,
							losses: snapshot.losses,
							draws: snapshot.draws,
							sets_won: snapshot.sets_won,
							sets_lost: snapshot.sets_lost,
						};
						console.log(JSON.stringify({
							tag: "[BASELINE_LOADED]",
							session_id: sessionId,
							player_id: playerId,
							source: "snapshot",
							snapshot_match_id: snapshot.match_id,
							baseline: baseline,
						}));
					} else {
						// Fallback to initial baseline if no snapshot found
						baseline = await getInitialBaseline(playerId, sessionId);
						console.log(JSON.stringify({
							tag: "[BASELINE_LOADED]",
							session_id: sessionId,
							player_id: playerId,
							source: "initial_baseline_fallback",
							baseline: baseline,
						}));
					}
				}

				baselineState.set(playerId, baseline);
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
			console.log(JSON.stringify({
				tag: "[BASELINE]",
				session_id: sessionId,
				baseline_state: baselineLog,
			}));

			// Step 6: Replay matches forward, updating Elo in memory
			// Track current state in memory (DO NOT read from player_ratings during replay)
			const currentState = new Map<string, {
				elo: number;
				matches_played: number;
				wins: number;
				losses: number;
				draws: number;
				sets_won: number;
				sets_lost: number;
			}>();

			// Initialize current state from baseline
			for (const [playerId, baseline] of baselineState.entries()) {
				currentState.set(playerId, { ...baseline });
			}

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

			// Process matches sequentially
			for (let i = 0; i < matchesToReplay.length; i++) {
				const match = matchesToReplay[i];
				const playerIds = match.player_ids as string[];

				// 5️⃣ DUPLICATE DETECTION
				if (replayedMatchIds.has(match.id)) {
					console.error(JSON.stringify({
						tag: "[ERROR]",
						session_id: sessionId,
						message: `Match ${match.id} replayed more than once`,
						match_id: match.id,
					}));
					continue;
				}
				replayedMatchIds.add(match.id);

				// Get scores: use new scores for edited match, existing scores for others
				let score1: number;
				let score2: number;

				if (match.id === matchId) {
					score1 = team1Score;
					score2 = team2Score;
				} else {
					const preserved = preservedScores.get(match.id);
					if (!preserved) {
						console.warn(`No preserved scores for match ${match.id}, skipping`);
						continue;
					}
					score1 = preserved.team1Score;
					score2 = preserved.team2Score;
				}

				// Get current state from memory (NOT from DB)
				const player1State = currentState.get(playerIds[0])!;
				const player2State = currentState.get(playerIds[1])!;

				const player1EloBefore = player1State.elo;
				const player2EloBefore = player2State.elo;
				const player1MatchesPlayedBefore = player1State.matches_played;
				const player2MatchesPlayedBefore = player2State.matches_played;

				// Calculate Elo delta using K-factor based on matches_played from memory
				const player1Result: MatchResult = score1 > score2 ? "win" : score1 < score2 ? "loss" : "draw";
				const player2Result: MatchResult = score2 > score1 ? "win" : score2 < score1 ? "loss" : "draw";
				const player1K = calculateKFactor(player1MatchesPlayedBefore);
				const player2K = calculateKFactor(player2MatchesPlayedBefore);
				const player1Expected = calculateExpectedScore(player1EloBefore, player2EloBefore);
				const player2Expected = calculateExpectedScore(player2EloBefore, player1EloBefore);
				const player1Actual = player1Result === "win" ? 1 : player1Result === "loss" ? 0 : 0.5;
				const player2Actual = player2Result === "win" ? 1 : player2Result === "loss" ? 0 : 0.5;
				const player1Delta = Math.round(player1K * (player1Actual - player1Expected));
				const player2Delta = Math.round(player2K * (player2Actual - player2Expected));

				// 4️⃣ PER-MATCH REPLAY - Before update
				console.log(JSON.stringify({
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
				}));

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
				console.log(JSON.stringify({
					tag: "[MATCH_REPLAY]",
					session_id: sessionId,
					match_index: matchIndex + i,
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
				}));

				// Create snapshot after this match
				try {
					await createEloSnapshots(match.id, playerIds, "singles");
				} catch (snapshotError) {
					console.error(`Error creating snapshot for match ${match.id}:`, snapshotError);
					// Continue even if snapshot creation fails
				}

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
						is_edited: match.id === matchId ? true : match.is_edited,
						edited_at: match.id === matchId ? new Date().toISOString() : match.edited_at,
						edited_by: match.id === matchId ? user.id : match.edited_by,
						edit_reason: match.id === matchId ? reason : match.edit_reason,
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

			console.log(JSON.stringify({
				tag: "[FINAL_COMPUTED]",
				session_id: sessionId,
				state: finalComputedState,
			}));

			// Update player_ratings with final computed state
			for (const [playerId, state] of currentState.entries()) {
				await adminClient
					.from("player_ratings")
					.upsert({
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
						matches_played: (rating.wins ?? 0) + (rating.losses ?? 0) + (rating.draws ?? 0),
						wins: rating.wins ?? 0,
						losses: rating.losses ?? 0,
						draws: rating.draws ?? 0,
					});
				}
			}

			console.log(JSON.stringify({
				tag: "[DB_PERSISTED]",
				session_id: sessionId,
				state: dbPersistedState,
			}));

			// Compare computed vs persisted
			for (const computed of finalComputedState) {
				const persisted = dbPersistedState.find(p => p.player_id === computed.player_id);
				if (persisted) {
					if (computed.elo !== persisted.elo || computed.matches_played !== persisted.matches_played) {
						console.error(JSON.stringify({
							tag: "[ERROR]",
							session_id: sessionId,
							message: "Computed vs persisted mismatch",
							player_id: computed.player_id,
							computed: computed,
							persisted: persisted,
						}));
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
					details: error instanceof Error ? error.message : String(error)
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
				details: error instanceof Error ? error.message : String(error)
			},
			{ status: 500 }
		);
	}
}

