import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getManagedRoleFromAuthUser } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateSinglesRatings, updateDoublesRatings } from "@/lib/elo/updates";
import {
	createEloSnapshots,
	captureCompletedSessionSnapshots,
} from "@/lib/elo/snapshots";
import { getOrCreateDoubleTeam } from "@/lib/elo/double-teams";
import { calculateBestWorstPlayer } from "@/lib/elo/best-worst-player";
import { getAuthToken } from "../../../../../_utils/auth";

type MatchScore = {
	matchId: string;
	team1Score: number;
	team2Score: number;
};

type AdminClient = ReturnType<typeof createAdminClient>;

type SessionMatchRecord = {
	id: string;
	match_type: "singles" | "doubles";
	player_ids: string[];
	status: "pending" | "completed";
	team1_score: number | null;
	team2_score: number | null;
	team_1_id: string | null;
	team_2_id: string | null;
	round_number: number;
	match_order: number;
};

type ScoreInput = {
	team1Score: number;
	team2Score: number;
};

type EloHistoryEntry = {
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
};

const isValidScore = (score: unknown): score is number => {
	return typeof score === "number" && !isNaN(score);
};

function getCombinedFivePlayerScore(
	firstHalfMatch: SessionMatchRecord,
	secondHalfMatch: SessionMatchRecord,
	secondHalfScore: ScoreInput,
): ScoreInput | null {
	if (
		firstHalfMatch.match_type !== "singles" ||
		secondHalfMatch.match_type !== "singles" ||
		!isValidScore(firstHalfMatch.team1_score) ||
		!isValidScore(firstHalfMatch.team2_score)
	) {
		return null;
	}

	const firstHalfPlayers = firstHalfMatch.player_ids;
	const secondHalfPlayers = secondHalfMatch.player_ids;

	if (
		firstHalfPlayers[0] === secondHalfPlayers[0] &&
		firstHalfPlayers[1] === secondHalfPlayers[1]
	) {
		return {
			team1Score: firstHalfMatch.team1_score + secondHalfScore.team1Score,
			team2Score: firstHalfMatch.team2_score + secondHalfScore.team2Score,
		};
	}

	if (
		firstHalfPlayers[0] === secondHalfPlayers[1] &&
		firstHalfPlayers[1] === secondHalfPlayers[0]
	) {
		return {
			team1Score: firstHalfMatch.team2_score + secondHalfScore.team1Score,
			team2Score: firstHalfMatch.team1_score + secondHalfScore.team2Score,
		};
	}

	return null;
}

async function getMaxRoundNumber(
	adminClient: AdminClient,
	sessionId: string,
): Promise<number | null> {
	const { data, error } = await adminClient
		.from("session_matches")
		.select("round_number")
		.eq("session_id", sessionId)
		.order("round_number", { ascending: false })
		.limit(1)
		.single();

	if (error || !data) {
		console.error("Error fetching max round number:", error);
		return null;
	}

	return data.round_number;
}

async function updateMatchScores(
	adminClient: AdminClient,
	matches: SessionMatchRecord[],
	matchScoresMap: Map<string, MatchScore>,
) {
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
	const updateErrors = updateResults.filter((result) => result.error);

	if (updateErrors.length > 0) {
		console.error("Error updating matches:", updateErrors);
		throw new Error("Failed to update match statuses");
	}
}

async function applyEloUpdatesForMatches(
	adminClient: AdminClient,
	matches: SessionMatchRecord[],
	getScore: (match: SessionMatchRecord) => ScoreInput,
): Promise<EloHistoryEntry[]> {
	const eloHistoryEntries: EloHistoryEntry[] = [];

	for (const match of matches) {
		const score = getScore(match);
		const isSingles = match.match_type === "singles";
		const playerIds = match.player_ids as string[];

		if (isSingles) {
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

			try {
				await updateSinglesRatings(
					playerIds[0],
					playerIds[1],
					score.team1Score,
					score.team2Score,
				);
			} catch (eloError) {
				console.error(
					`Error updating Elo ratings for match ${match.id}:`,
					eloError,
				);
				throw new Error(
					`Failed to update Elo ratings: ${
						eloError instanceof Error ? eloError.message : String(eloError)
					}`,
				);
			}

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

			try {
				await createEloSnapshots(match.id, playerIds, "singles");
			} catch (snapshotError) {
				console.error(
					`Error creating snapshots for match ${match.id}:`,
					snapshotError,
				);
			}
		} else {
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

			try {
				await updateDoublesRatings(
					[playerIds[0], playerIds[1]],
					[playerIds[2], playerIds[3]],
					score.team1Score,
					score.team2Score,
				);
			} catch (eloError) {
				console.error(
					`Error updating Elo ratings for match ${match.id}:`,
					eloError,
				);
				throw new Error(
					`Failed to update Elo ratings: ${
						eloError instanceof Error ? eloError.message : String(eloError)
					}`,
				);
			}

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

			try {
				await createEloSnapshots(match.id, playerIds, "doubles");
			} catch (snapshotError) {
				console.error(
					`Error creating snapshots for match ${match.id}:`,
					snapshotError,
				);
			}
		}
	}

	return eloHistoryEntries;
}

async function insertEloHistory(
	adminClient: AdminClient,
	eloHistoryEntries: EloHistoryEntry[],
) {
	if (eloHistoryEntries.length === 0) {
		return;
	}

	const { error } = await adminClient
		.from("match_elo_history")
		.insert(eloHistoryEntries);

	if (error) {
		console.error("Error inserting Elo history:", error);
	}
}

async function completeSession(adminClient: AdminClient, sessionId: string) {
	const bestWorst = await calculateBestWorstPlayer(sessionId);

	const { error } = await adminClient
		.from("sessions")
		.update({
			status: "completed",
			completed_at: new Date().toISOString(),
			best_player_id: bestWorst.best_player_id,
			best_player_display_name: bestWorst.best_player_display_name,
			best_player_delta: bestWorst.best_player_delta,
			worst_player_id: bestWorst.worst_player_id,
			worst_player_display_name: bestWorst.worst_player_display_name,
			worst_player_delta: bestWorst.worst_player_delta,
		})
		.eq("id", sessionId);

	if (error) {
		console.error("Error marking session as completed:", error);
		return;
	}

	try {
		await captureCompletedSessionSnapshots(sessionId, adminClient);
		revalidateTag("statistics");
	} catch (snapshotError) {
		console.error("Error capturing completed session snapshots:", snapshotError);
	}
}

/**
 * POST /api/sessions/[sessionId]/rounds/[roundNumber]/submit
 *
 * Submit all match results for a round and update Elo ratings when applicable.
 * Ten-round 5-player sessions save the first five rounds without Elo. Each
 * second-half round combines with its matching first-half round and rates that
 * pairing once as a longer match.
 *
 * This endpoint:
 * - Validates all matches have scores
 * - Ensures all matches are still pending
 * - Persists scores
 * - Marks matches as completed
 * - Calculates and persists Elo changes immediately, except for the first five
 *   rounds of ten-round 5-player sessions
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
	{ params }: { params: { sessionId: string; roundNumber: string } },
) {
	const adminClient = createAdminClient();

	try {
		const token = getAuthToken(request);
		if (!token) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 },
			);
		}

		const sessionId = params.sessionId;
		const roundNumber = params.roundNumber;

		if (!sessionId || !roundNumber) {
			return NextResponse.json(
				{ error: "Session ID and round number are required" },
				{ status: 400 },
			);
		}

		const roundNum = parseInt(roundNumber, 10);

		if (isNaN(roundNum)) {
			return NextResponse.json(
				{ error: "Invalid round number" },
				{ status: 400 },
			);
		}

		// Verify user is authenticated (admin client validates the JWT)
		const {
			data: { user },
			error: userError,
		} = await adminClient.auth.getUser(token);

		if (userError || !user) {
			return NextResponse.json(
				{
					error: "Unauthorized. Authentication required.",
					detail: userError?.message || "Invalid token",
				},
				{ status: 401 },
			);
		}

		// Verify user owns the session and check status
		const { data: session, error: sessionError } = await adminClient
			.from("sessions")
			.select("created_by, status, player_count")
			.eq("id", sessionId)
			.single();

		if (sessionError || !session) {
			return NextResponse.json(
				{ error: "Session not found" },
				{ status: 404 },
			);
		}

		// Check if user owns the session OR is admin
		const isAdmin = getManagedRoleFromAuthUser(user) === "admin";
		if (session.created_by !== user.id && !isAdmin) {
			return NextResponse.json(
				{
					error: "Unauthorized. You can only submit results for your own sessions.",
				},
				{ status: 403 },
			);
		}

		// Prevent submissions to completed sessions
		if (session.status === "completed") {
			return NextResponse.json(
				{
					error: "Session is already completed. Cannot submit more rounds.",
				},
				{ status: 409 }, // Conflict
			);
		}

		// Parse request body
		const body = await request.json();
		const { matchScores }: { matchScores: MatchScore[] } = body;

		if (!Array.isArray(matchScores) || matchScores.length === 0) {
			return NextResponse.json(
				{ error: "matchScores must be a non-empty array" },
				{ status: 400 },
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
				{ status: 404 },
			);
		}

		// Validate: All matches must be pending
		const completedMatches = matches.filter(
			(m) => m.status === "completed",
		);
		if (completedMatches.length > 0) {
			return NextResponse.json(
				{ error: "Round already completed. Cannot resubmit." },
				{ status: 409 }, // Conflict
			);
		}

		// Validate: All matches must have scores provided
		const matchScoresMap = new Map(
			matchScores.map((ms) => [ms.matchId, ms]),
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
				{ status: 400 },
			);
		}

		// Validate: All provided match IDs must exist in this round
		const matchIds = new Set(matches.map((m) => m.id));
		const invalidMatches = matchScores.filter(
			(ms) => !matchIds.has(ms.matchId),
		);
		if (invalidMatches.length > 0) {
			return NextResponse.json(
				{ error: "Invalid match IDs provided" },
				{ status: 400 },
			);
		}

		const maxRoundNumber = await getMaxRoundNumber(adminClient, sessionId);
		if (maxRoundNumber === null) {
			return NextResponse.json(
				{ error: "Failed to determine final round" },
				{ status: 500 },
			);
		}

		const isLastRound = roundNum >= maxRoundNumber;
		const isTenRoundFivePlayerSession =
			session.player_count === 5 && maxRoundNumber >= 10;

		if (isTenRoundFivePlayerSession) {
			if (roundNum <= 5) {
				try {
					await updateMatchScores(
						adminClient,
						matches as SessionMatchRecord[],
						matchScoresMap,
					);
				} catch {
					return NextResponse.json(
						{ error: "Failed to update match statuses" },
						{ status: 500 },
					);
				}

				return NextResponse.json({
					success: true,
					message: "Round scores saved successfully",
					ratingsDeferred: true,
				});
			}

			const pairedFirstHalfRoundNumber = roundNum - 5;
			const { data: allMatches, error: allMatchesError } = await adminClient
				.from("session_matches")
				.select("*")
				.eq("session_id", sessionId)
				.order("round_number", { ascending: true })
				.order("match_order", { ascending: true });

			if (allMatchesError || !allMatches) {
				console.error("Error fetching session matches:", allMatchesError);
				return NextResponse.json(
					{ error: "Failed to fetch session matches" },
					{ status: 500 },
				);
			}

			const currentRoundMatchIds = matches.map((match) => match.id);
			if (currentRoundMatchIds.length > 0) {
				const { data: existingHistory, error: historyLookupError } =
					await adminClient
						.from("match_elo_history")
						.select("match_id")
						.in("match_id", currentRoundMatchIds)
						.limit(1);

				if (historyLookupError) {
					console.error(
						"Error checking existing Elo history:",
						historyLookupError,
					);
					return NextResponse.json(
						{ error: "Failed to verify Elo history state" },
						{ status: 500 },
					);
				}

				if (existingHistory && existingHistory.length > 0) {
					return NextResponse.json(
						{
							error:
								"Elo has already been calculated for this round. Cannot calculate it again.",
						},
						{ status: 409 },
					);
				}
			}

			const firstHalfMatchesByOrder = new Map(
				(allMatches as SessionMatchRecord[])
					.filter(
						(match) =>
							match.round_number === pairedFirstHalfRoundNumber,
					)
					.map((match) => [match.match_order, match]),
			);
			const combinedScoresByMatchId = new Map<string, ScoreInput>();

			for (const match of matches as SessionMatchRecord[]) {
				const firstHalfMatch = firstHalfMatchesByOrder.get(match.match_order);
				const secondHalfScore = matchScoresMap.get(match.id);
				if (!firstHalfMatch || !secondHalfScore) {
					return NextResponse.json(
						{
							error:
								"Matching first-half score is required before Elo calculation can start.",
						},
						{ status: 400 },
					);
				}

				if (firstHalfMatch.status !== "completed") {
					return NextResponse.json(
						{
							error:
								"Matching first-half round must be submitted before Elo calculation can start.",
						},
						{ status: 400 },
					);
				}

				const combinedScore = getCombinedFivePlayerScore(
					firstHalfMatch,
					match,
					secondHalfScore,
				);

				if (!combinedScore) {
					return NextResponse.json(
						{
							error:
								"Matching first-half and second-half players do not line up.",
						},
						{ status: 400 },
					);
				}

				combinedScoresByMatchId.set(match.id, combinedScore);
			}

			const eloHistoryEntries = await applyEloUpdatesForMatches(
				adminClient,
				matches as SessionMatchRecord[],
				(match) => combinedScoresByMatchId.get(match.id)!,
			);

			await insertEloHistory(adminClient, eloHistoryEntries);

			try {
				await updateMatchScores(
					adminClient,
					matches as SessionMatchRecord[],
					matchScoresMap,
				);
			} catch {
				return NextResponse.json(
					{ error: "Failed to update match statuses" },
					{ status: 500 },
				);
			}

			if (isLastRound) {
				await completeSession(adminClient, sessionId);
			}

			return NextResponse.json({
				success: true,
				message: isLastRound
					? "Session submitted and ratings calculated successfully"
					: "Round submitted and ratings calculated successfully",
				ratingsApplied: true,
				combinedWithRound: pairedFirstHalfRoundNumber,
			});
		}

		const eloHistoryEntries = await applyEloUpdatesForMatches(
			adminClient,
			matches as SessionMatchRecord[],
			(match) => matchScoresMap.get(match.id)!,
		);

		try {
			await updateMatchScores(
				adminClient,
				matches as SessionMatchRecord[],
				matchScoresMap,
			);
		} catch {
			return NextResponse.json(
				{ error: "Failed to update match statuses" },
				{ status: 500 },
			);
		}

		await insertEloHistory(adminClient, eloHistoryEntries);

		// Check if this is Round 5 for a 6-player session - if so, update Round 6 dynamically
		if (roundNum === 5) {
			// Check if this is a 6-player session
			const { data: sessionData } = await adminClient
				.from("sessions")
				.select("player_count")
				.eq("id", sessionId)
				.single();

			if (sessionData && sessionData.player_count === 6) {
				// Find Round 5 matches to determine Round 6
				const round5DoublesMatch = matches.find(
					(m) => m.match_type === "doubles",
				);
				const round5SinglesMatch = matches.find(
					(m) => m.match_type === "singles",
				);

				if (round5DoublesMatch && round5SinglesMatch) {
					const doublesScore = matchScoresMap.get(
						round5DoublesMatch.id,
					)!;

					// Determine winners of Round 5 doubles
					const doublesPlayerIds =
						round5DoublesMatch.player_ids as string[];
					// Team 1: [0, 1], Team 2: [2, 3]
					const doublesWinners =
						doublesScore.team1Score > doublesScore.team2Score
							? [doublesPlayerIds[0], doublesPlayerIds[1]]
							: [doublesPlayerIds[2], doublesPlayerIds[3]];

					// Get players from Round 5 singles
					const singlesPlayerIds =
						round5SinglesMatch.player_ids as string[];

					// Round 6 doubles: winners from Round 5 doubles vs players from Round 5 singles
					// Round 6 singles: the remaining players (losers from Round 5 doubles)
					const doublesLosers =
						doublesScore.team1Score > doublesScore.team2Score
							? [doublesPlayerIds[2], doublesPlayerIds[3]]
							: [doublesPlayerIds[0], doublesPlayerIds[1]];

					// Fetch Round 6 matches to update
					const { data: round6Matches, error: round6Error } =
						await adminClient
							.from("session_matches")
							.select("*")
							.eq("session_id", sessionId)
							.eq("round_number", 6)
							.order("match_order", { ascending: true });

					if (
						!round6Error &&
						round6Matches &&
						round6Matches.length > 0
					) {
						// Update Round 6 doubles match
						const round6DoublesMatch = round6Matches.find(
							(m) => m.match_type === "doubles",
						);
						const round6SinglesMatch = round6Matches.find(
							(m) => m.match_type === "singles",
						);

						if (round6DoublesMatch) {
							// Update doubles match: winners from Round 5 doubles + players from Round 5 singles
							const newDoublesPlayerIds = [
								...doublesWinners,
								...singlesPlayerIds,
							];

							// Get/create team IDs for the new doubles match
							// Team 1: winners from Round 5 doubles
							// Team 2: players from Round 5 singles
							const team1Id = await getOrCreateDoubleTeam(
								doublesWinners[0],
								doublesWinners[1],
							);
							const team2Id = await getOrCreateDoubleTeam(
								singlesPlayerIds[0],
								singlesPlayerIds[1],
							);

							await adminClient
								.from("session_matches")
								.update({
									player_ids: newDoublesPlayerIds,
									team_1_id: team1Id,
									team_2_id: team2Id,
								})
								.eq("id", round6DoublesMatch.id);
						}

						if (round6SinglesMatch) {
							// Update singles match: losers from Round 5 doubles
							await adminClient
								.from("session_matches")
								.update({
									player_ids: doublesLosers,
									team_1_id: null,
									team_2_id: null,
								})
								.eq("id", round6SinglesMatch.id);
						}
					}

					// Fetch Round 7 matches to update
					const { data: round7Matches, error: round7Error } =
						await adminClient
							.from("session_matches")
							.select("*")
							.eq("session_id", sessionId)
							.eq("round_number", 7)
							.order("match_order", { ascending: true });

					if (
						!round7Error &&
						round7Matches &&
						round7Matches.length > 0
					) {
						const round7DoublesMatch = round7Matches.find(
							(m) => m.match_type === "doubles",
						);
						const round7SinglesMatch = round7Matches.find(
							(m) => m.match_type === "singles",
						);

						if (round7DoublesMatch) {
							// Update doubles match: losers from Round 5 doubles + players from Round 5 singles
							const newDoublesPlayerIds = [
								...doublesLosers,
								...singlesPlayerIds,
							];

							// Team 1: losers from Round 5 doubles
							// Team 2: players from Round 5 singles
							const team1Id = await getOrCreateDoubleTeam(
								doublesLosers[0],
								doublesLosers[1],
							);
							const team2Id = await getOrCreateDoubleTeam(
								singlesPlayerIds[0],
								singlesPlayerIds[1],
							);

							await adminClient
								.from("session_matches")
								.update({
									player_ids: newDoublesPlayerIds,
									team_1_id: team1Id,
									team_2_id: team2Id,
								})
								.eq("id", round7DoublesMatch.id);
						}

						if (round7SinglesMatch) {
							// Update singles match: winners from Round 5 doubles
							await adminClient
								.from("session_matches")
								.update({
									player_ids: doublesWinners,
									team_1_id: null,
									team_2_id: null,
								})
								.eq("id", round7SinglesMatch.id);
						}
					}
				}
			}
		}

		if (isLastRound) {
			await completeSession(adminClient, sessionId);
		}

		// Success
		return NextResponse.json({
			success: true,
			message: "Round submitted successfully",
		});
	} catch (error) {
		console.error(
			"Unexpected error in POST /api/sessions/[sessionId]/rounds/[roundNumber]/submit:",
			error,
		);
		return NextResponse.json(
			{
				error: "Internal server error",
				details: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			},
			{ status: 500 },
		);
	}
}
