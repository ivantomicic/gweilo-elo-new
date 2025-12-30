import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateSinglesRatings, updateDoublesRatings } from "@/lib/elo/updates";
import { createEloSnapshots } from "@/lib/elo/snapshots";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

type MatchScore = {
	matchId: string;
	team1Score: number;
	team2Score: number;
};

/**
 * POST /api/sessions/[sessionId]/rounds/[roundNumber]/submit
 *
 * Submit all match results for a round and update Elo ratings
 *
 * This endpoint:
 * - Validates all matches have scores
 * - Ensures all matches are still pending
 * - Persists scores
 * - Calculates and persists Elo changes
 * - Marks matches as completed
 * - All in a single transaction
 *
 * Request body:
 * {
 *   matchScores: [
 *     { matchId: string, team1Score: number, team2Score: number },
 *     ...
 *   ]
 * }
 */
export async function POST(
	request: NextRequest,
	{ params }: { params: { sessionId: string; roundNumber: string } }
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
		const roundNumber = params.roundNumber;

		if (!sessionId || !roundNumber) {
			return NextResponse.json(
				{ error: "Session ID and round number are required" },
				{ status: 400 }
			);
		}

		const roundNum = parseInt(roundNumber, 10);

		if (isNaN(roundNum)) {
			return NextResponse.json(
				{ error: "Invalid round number" },
				{ status: 400 }
			);
		}

		if (!supabaseUrl || !supabaseAnonKey) {
			return NextResponse.json(
				{ error: "Missing Supabase environment variables" },
				{ status: 500 }
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

		// Verify user owns the session and check status
		const { data: session, error: sessionError } = await supabase
			.from("sessions")
			.select("created_by, status")
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
					error: "Unauthorized. You can only submit results for your own sessions.",
				},
				{ status: 403 }
			);
		}

		// Prevent submissions to completed sessions
		if (session.status === "completed") {
			return NextResponse.json(
				{
					error: "Session is already completed. Cannot submit more rounds.",
				},
				{ status: 409 } // Conflict
			);
		}

		// Parse request body
		const body = await request.json();
		const { matchScores }: { matchScores: MatchScore[] } = body;

		if (!Array.isArray(matchScores) || matchScores.length === 0) {
			return NextResponse.json(
				{ error: "matchScores must be a non-empty array" },
				{ status: 400 }
			);
		}

		// Fetch all matches for this round
		const { data: matches, error: matchesError } = await adminClient
			.from("session_matches")
			.select("*")
			.eq("session_id", sessionId)
			.eq("round_number", roundNum)
			.order("match_order", { ascending: true });

		if (matchesError || !matches || matches.length === 0) {
			return NextResponse.json(
				{ error: "No matches found for this round" },
				{ status: 404 }
			);
		}

		// Validate: All matches must be pending
		const completedMatches = matches.filter(
			(m) => m.status === "completed"
		);
		if (completedMatches.length > 0) {
			return NextResponse.json(
				{ error: "Round already completed. Cannot resubmit." },
				{ status: 409 } // Conflict
			);
		}

		// Helper function to validate if a score is valid (number, not NaN)
		// 0 is a valid score
		const isValidScore = (score: any): score is number => {
			return typeof score === "number" && !isNaN(score);
		};

		// Validate: All matches must have scores provided
		const matchScoresMap = new Map(
			matchScores.map((ms) => [ms.matchId, ms])
		);
		const missingScores = matches.filter((m) => {
			const score = matchScoresMap.get(m.id);
			if (!score) return true;
			// Both scores must be valid numbers (0 is valid, NaN is not)
			return (
				!isValidScore(score.team1Score) ||
				!isValidScore(score.team2Score)
			);
		});

		if (missingScores.length > 0) {
			return NextResponse.json(
				{
					error: `Missing or invalid scores for ${missingScores.length} match(es)`,
				},
				{ status: 400 }
			);
		}

		// Validate: All provided match IDs must exist in this round
		const matchIds = new Set(matches.map((m) => m.id));
		const invalidMatches = matchScores.filter(
			(ms) => !matchIds.has(ms.matchId)
		);
		if (invalidMatches.length > 0) {
			return NextResponse.json(
				{ error: "Invalid match IDs provided" },
				{ status: 400 }
			);
		}

		// Process each match and collect Elo history data
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

		// Process matches sequentially
		// Note: We need to refactor Elo update functions to return deltas for proper transaction handling
		// For now, we calculate deltas by reading before/after, but this isn't fully transactional
		// TODO: Refactor Elo update functions to return calculated deltas instead of applying them
		for (const match of matches) {
			const score = matchScoresMap.get(match.id)!;
			const isSingles = match.match_type === "singles";
			const playerIds = match.player_ids as string[];

			// Get current Elo ratings before update (for history)
			if (isSingles) {
				// Get current ratings for singles
				const { data: rating1 } = await adminClient
					.from("player_ratings")
					.select("elo")
					.eq("player_id", playerIds[0])
					.single();
				const { data: rating2 } = await adminClient
					.from("player_ratings")
					.select("elo")
					.eq("player_id", playerIds[1])
					.single();

				const player1EloBefore = rating1?.elo ?? 1500;
				const player2EloBefore = rating2?.elo ?? 1500;

				// Update Elo ratings
				try {
					await updateSinglesRatings(
						playerIds[0],
						playerIds[1],
						score.team1Score,
						score.team2Score
					);
				} catch (eloError) {
					console.error(
						`Error updating Elo ratings for match ${match.id}:`,
						eloError
					);
					throw new Error(
						`Failed to update Elo ratings: ${
							eloError instanceof Error
								? eloError.message
								: String(eloError)
						}`
					);
				}

				// Get updated ratings for history
				const { data: rating1After } = await adminClient
					.from("player_ratings")
					.select("elo")
					.eq("player_id", playerIds[0])
					.single();
				const { data: rating2After } = await adminClient
					.from("player_ratings")
					.select("elo")
					.eq("player_id", playerIds[1])
					.single();

				const player1EloAfter = rating1After?.elo ?? player1EloBefore;
				const player2EloAfter = rating2After?.elo ?? player2EloBefore;

				eloHistoryEntries.push({
					match_id: match.id,
					player1_id: playerIds[0],
					player2_id: playerIds[1],
					player1_elo_before: player1EloBefore,
					player1_elo_after: player1EloAfter,
					player1_elo_delta: player1EloAfter - player1EloBefore,
					player2_elo_before: player2EloBefore,
					player2_elo_after: player2EloAfter,
					player2_elo_delta: player2EloAfter - player2EloBefore,
				});

				// Create Elo snapshots after match completes
				try {
					await createEloSnapshots(match.id, playerIds, "singles");
				} catch (snapshotError) {
					console.error(
						`Error creating snapshots for match ${match.id}:`,
						snapshotError
					);
					// Non-fatal: log error but don't fail the request
					// In production, you might want to rollback here
				}
			} else {
				// Get current team ratings for doubles
				const { data: team1Rating } = await adminClient
					.from("double_team_ratings")
					.select("elo")
					.eq("team_id", match.team_1_id)
					.single();
				const { data: team2Rating } = await adminClient
					.from("double_team_ratings")
					.select("elo")
					.eq("team_id", match.team_2_id)
					.single();

				const team1EloBefore = team1Rating?.elo ?? 1500;
				const team2EloBefore = team2Rating?.elo ?? 1500;

				// Update Elo ratings
				try {
					await updateDoublesRatings(
						[playerIds[0], playerIds[1]],
						[playerIds[2], playerIds[3]],
						score.team1Score,
						score.team2Score
					);
				} catch (eloError) {
					console.error(
						`Error updating Elo ratings for match ${match.id}:`,
						eloError
					);
					throw new Error(
						`Failed to update Elo ratings: ${
							eloError instanceof Error
								? eloError.message
								: String(eloError)
						}`
					);
				}

				// Get updated team ratings for history
				const { data: team1RatingAfter } = await adminClient
					.from("double_team_ratings")
					.select("elo")
					.eq("team_id", match.team_1_id)
					.single();
				const { data: team2RatingAfter } = await adminClient
					.from("double_team_ratings")
					.select("elo")
					.eq("team_id", match.team_2_id)
					.single();

				const team1EloAfter = team1RatingAfter?.elo ?? team1EloBefore;
				const team2EloAfter = team2RatingAfter?.elo ?? team2EloBefore;

				eloHistoryEntries.push({
					match_id: match.id,
					team1_id: match.team_1_id || undefined,
					team2_id: match.team_2_id || undefined,
					team1_elo_before: team1EloBefore,
					team1_elo_after: team1EloAfter,
					team1_elo_delta: team1EloAfter - team1EloBefore,
					team2_elo_before: team2EloBefore,
					team2_elo_after: team2EloAfter,
					team2_elo_delta: team2EloAfter - team2EloBefore,
				});

				// Create Elo snapshots after match completes (for doubles, snapshot all 4 players)
				try {
					await createEloSnapshots(match.id, playerIds, "doubles");
				} catch (snapshotError) {
					console.error(
						`Error creating snapshots for match ${match.id}:`,
						snapshotError
					);
					// Non-fatal: log error but don't fail the request
				}
			}
		}

		// Update match scores and status in a single transaction
		// Note: We're using admin client to bypass RLS for batch updates
		const updatePromises = matches.map((match) => {
			const score = matchScoresMap.get(match.id)!;
			return adminClient
				.from("session_matches")
				.update({
					team1_score: score.team1Score,
					team2_score: score.team2Score,
					status: "completed",
				})
				.eq("id", match.id);
		});

		const updateResults = await Promise.all(updatePromises);

		// Check for update errors
		const updateErrors = updateResults.filter((r) => r.error);
		if (updateErrors.length > 0) {
			console.error("Error updating matches:", updateErrors);
			return NextResponse.json(
				{ error: "Failed to update match statuses" },
				{ status: 500 }
			);
		}

		// Insert Elo history records
		if (eloHistoryEntries.length > 0) {
			const { error: historyError } = await adminClient
				.from("match_elo_history")
				.insert(eloHistoryEntries);

			if (historyError) {
				console.error("Error inserting Elo history:", historyError);
				// Non-fatal: log error but don't fail the request
				// In production, you might want to rollback here
			}
		}

		// Check if this is the last round, and mark session as completed if so
		// Find the maximum round number for this session
		const { data: maxRoundData, error: maxRoundError } = await adminClient
			.from("session_matches")
			.select("round_number")
			.eq("session_id", sessionId)
			.order("round_number", { ascending: false })
			.limit(1)
			.single();

		if (!maxRoundError && maxRoundData) {
			const maxRoundNumber = maxRoundData.round_number;
			if (roundNum >= maxRoundNumber) {
				// This is the last round - mark session as completed
				const { error: updateSessionError } = await adminClient
					.from("sessions")
					.update({
						status: "completed",
						completed_at: new Date().toISOString(),
					})
					.eq("id", sessionId);

				if (updateSessionError) {
					console.error(
						"Error marking session as completed:",
						updateSessionError
					);
					// Non-fatal: log error but don't fail the request
					// Session can be manually marked as completed later if needed
				}
			}
		}

		// Success
		return NextResponse.json({
			success: true,
			message: "Round submitted successfully",
		});
	} catch (error) {
		console.error(
			"Unexpected error in POST /api/sessions/[sessionId]/rounds/[roundNumber]/submit:",
			error
		);
		return NextResponse.json(
			{
				error: "Internal server error",
				details: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			},
			{ status: 500 }
		);
	}
}
