import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getManagedRoleFromAuthUser } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateDoubleTeam } from "@/lib/elo/double-teams";
import { refreshSessionBestWorstPlayer } from "@/lib/elo/best-worst-player";
import {
	claimRoundSubmission,
	failRoundSubmission,
} from "@/lib/elo/round-submission-guard";
import {
	buildAtomicRoundPlan,
	type AtomicMatch,
	type AtomicScore,
} from "@/lib/elo/round-transaction";
import { loadAtomicRatingInputs } from "@/lib/elo/round-transaction-loader";
import { normalizePlayerIDs } from "@/lib/sessions/player-id";
import {
	combineTwoHalfSinglesScore,
	detectTwoHalfSinglesSession,
} from "@/lib/sessions/two-half-singles";
import { notifySessionCompleted } from "@/lib/notifications/events";
import { refreshMissionSnapshotsAfterDataChange } from "@/lib/rivalries/service";
import {
	endSessionLiveActivitySafely,
	updateSessionLiveActivitySafely,
} from "@/lib/live-activities/service";
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
	is_rated: boolean;
};

type ScoreInput = {
	team1Score: number;
	team2Score: number;
};

const isValidScore = (score: unknown): score is number => {
	return (
		typeof score === "number" &&
		Number.isInteger(score) &&
		score >= 0
	);
};

const normalizeMatchId = (matchId: unknown) =>
	typeof matchId === "string" ? matchId.toLowerCase() : "";

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

async function finalizeSessionMetadata(adminClient: AdminClient, sessionId: string) {
	try {
		await refreshSessionBestWorstPlayer(sessionId, adminClient);
	} catch (error) {
		// Core completion and snapshots are already committed atomically. These
		// display-only fields must not turn a successful settlement into a 500.
		console.error("Error calculating completed-session metadata:", error);
	} finally {
		revalidateTag("statistics");
	}

	try {
		await refreshMissionSnapshotsAfterDataChange({
			adminClient,
			reason: "session_completed",
		});
	} catch (error) {
		// Invalidation happens first, so a later homepage request retries instead
		// of displaying missions from the previous session.
		console.error("Error refreshing missions after session completion:", error);
	}
}

/**
 * POST /api/sessions/[sessionId]/rounds/[roundNumber]/submit
 *
 * Submit all match results for a round and update Elo ratings when applicable.
 * Supported two-half singles sessions save their first rotation without Elo.
 * Each second-half round combines with its matching first-half round and rates
 * that pairing once as a longer match.
 *
 * This endpoint:
 * - Validates all matches have scores
 * - Ensures all matches are still pending
 * - Persists scores
 * - Marks matches as completed
 * - Calculates and persists Elo changes immediately, except during the first
 *   rotation of a two-half singles session
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
	let submissionId: string | undefined;
	let submissionClaimToken: string | undefined;
	let submissionCompleted = false;
	let submissionFailure: unknown = "Round submission did not complete";

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

		// Idempotent retries must succeed even after the round (or final session)
		// has already transitioned to completed.
		const { data: existingSubmission, error: existingSubmissionError } =
			await adminClient
				.from("elo_round_submissions")
				.select("status, response")
				.eq("session_id", sessionId)
				.eq("round_number", roundNum)
				.maybeSingle();
		if (existingSubmissionError) {
			throw new Error(
				`Failed to check round submission state: ${existingSubmissionError.message}`,
			);
		}
		if (existingSubmission?.status === "completed") {
			return NextResponse.json(
				existingSubmission.response ?? {
					success: true,
					message: "Round was already submitted successfully",
				},
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
		const { data: rawMatches, error: matchesError } = await adminClient
			.from("session_matches")
			.select("*")
			.eq("session_id", sessionId)
			.eq("round_number", roundNum)
			.order("match_order", { ascending: true });

		if (matchesError || !rawMatches || rawMatches.length === 0) {
			return NextResponse.json(
				{ error: "No matches found for this round" },
				{ status: 404 },
			);
		}
		const matches = (rawMatches as SessionMatchRecord[]).map((match) => ({
			...match,
			player_ids: normalizePlayerIDs(match.player_ids),
		}));

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
			matchScores.map((score) => [
				normalizeMatchId(score.matchId),
				score,
			]),
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
			(score) => !matchIds.has(normalizeMatchId(score.matchId)),
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
		const excludeSubmittingUserIds =
			request.headers.get("x-gweilo-client")?.toLowerCase() === "ios"
				? [user.id]
				: [];
		const publishSuccessfulRound = () =>
			isLastRound
				? Promise.all([
						notifySessionCompleted({
							sessionId,
							createdBy: user.id,
							excludeUserIds: excludeSubmittingUserIds,
						}),
						endSessionLiveActivitySafely(sessionId),
					])
				: updateSessionLiveActivitySafely(sessionId);
		const { data: sessionMatchesForPairing, error: pairingMatchesError } =
			await adminClient
				.from("session_matches")
				.select("*")
				.eq("session_id", sessionId)
				.order("round_number", { ascending: true })
				.order("match_order", { ascending: true });
		if (pairingMatchesError || !sessionMatchesForPairing) {
			console.error(
				"Error fetching session matches for aggregate scoring:",
				pairingMatchesError,
			);
			return NextResponse.json(
				{ error: "Failed to verify session scoring format" },
				{ status: 500 },
			);
		}
		const twoHalfSinglesConfig = detectTwoHalfSinglesSession(
			session.player_count,
			sessionMatchesForPairing as SessionMatchRecord[],
		);
		const submissionClaim = await claimRoundSubmission(sessionId, roundNum);

		if (submissionClaim.state === "completed") {
			return NextResponse.json(
				submissionClaim.response ?? {
					success: true,
					message: "Round was already submitted successfully",
				},
			);
		}

		if (submissionClaim.state === "processing") {
			return NextResponse.json(
				{ error: "Round submission is already in progress. Please wait." },
				{ status: 409 },
			);
		}

		submissionId = submissionClaim.submissionId;
		submissionClaimToken = submissionClaim.claimToken;
		const commitAtomicSubmission = async ({
			response,
			eloScores = matchScoresMap,
			applyRatings = true,
		}: {
			response: Record<string, unknown>;
			eloScores?: Map<string, AtomicScore>;
			applyRatings?: boolean;
		}) => {
			const atomicMatches = matches as AtomicMatch[];
			const ratingInputs = applyRatings
				? await loadAtomicRatingInputs(adminClient, atomicMatches)
				: [];
			const plan = buildAtomicRoundPlan({
				matches: atomicMatches,
				displayScores: matchScoresMap,
				eloScores,
				applyRatings,
				ratingInputs,
			});
			const { data, error } = await adminClient.rpc("commit_atomic_elo_round", {
				p_session_id: sessionId,
				p_round_number: roundNum,
				p_submission_id: submissionId!,
				p_claim_token: submissionClaimToken!,
				p_plan: plan,
				p_response: response,
				p_complete_session: isLastRound,
			});
			if (error) throw new Error(`Atomic ELO commit failed: ${error.message}`);
			submissionCompleted = true;
			return (data ?? response) as Record<string, unknown>;
		};

		if (twoHalfSinglesConfig) {
			if (roundNum <= twoHalfSinglesConfig.halfRoundCount) {
				const response = await commitAtomicSubmission({
					applyRatings: false,
					response: {
					success: true,
					message: "Round scores saved successfully",
						ratingsDeferred: true,
					},
				});
				await publishSuccessfulRound();
				return NextResponse.json(response);
			}

			const pairedFirstHalfRoundNumber =
				roundNum - twoHalfSinglesConfig.halfRoundCount;
			const allMatches = sessionMatchesForPairing;

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
					submissionFailure = new Error(
						`Failed to verify Elo history state: ${historyLookupError.message}`,
					);
					return NextResponse.json(
						{ error: "Failed to verify Elo history state" },
						{ status: 500 },
					);
				}

				if (existingHistory && existingHistory.length > 0) {
					submissionFailure = new Error(
						"Elo has already been calculated for this round.",
					);
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
					submissionFailure = new Error(
						"Matching first-half score is required before Elo calculation can start.",
					);
					return NextResponse.json(
						{
							error:
								"Matching first-half score is required before Elo calculation can start.",
						},
						{ status: 400 },
					);
				}

				if (firstHalfMatch.status !== "completed") {
					submissionFailure = new Error(
						"Matching first-half round must be submitted before Elo calculation can start.",
					);
					return NextResponse.json(
						{
							error:
								"Matching first-half round must be submitted before Elo calculation can start.",
						},
						{ status: 400 },
					);
				}

				const combinedScore = combineTwoHalfSinglesScore(
					firstHalfMatch,
					match,
					secondHalfScore,
				);

				if (!combinedScore) {
					submissionFailure = new Error(
						"Matching first-half and second-half players do not line up.",
					);
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

			const atomicResponse = await commitAtomicSubmission({
				eloScores: combinedScoresByMatchId,
				response: {
					success: true,
					message: isLastRound
						? "Session submitted and ratings calculated successfully"
						: "Round submitted and ratings calculated successfully",
					ratingsApplied: true,
					combinedWithRound: pairedFirstHalfRoundNumber,
				},
			});

			if (isLastRound) {
				await finalizeSessionMetadata(adminClient, sessionId);
			}

			await publishSuccessfulRound();
			return NextResponse.json(atomicResponse);
		}

		const atomicResponse = await commitAtomicSubmission({
			response: { success: true, message: "Round submitted successfully" },
		});

		// Check if this is Round 5 for a 6-player session - if so, update Round 6 dynamically
		if (roundNum === 5) {
			// Check if this is a 6-player session
			const { data: sessionData } = await adminClient
				.from("sessions")
				.select("player_count")
				.eq("id", sessionId)
				.single();

			if (sessionData && sessionData.player_count === 6) {
				const { data: placeholders } = await adminClient
					.from("session_placeholders")
					.select("id")
					.eq("session_id", sessionId);
				const placeholderIds = new Set(
					(placeholders || []).map((placeholder) => placeholder.id),
				);
				const isRatedPlayers = (playerIds: string[]) =>
					playerIds.every((playerId) => !placeholderIds.has(playerId));
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
							const isRated = isRatedPlayers(newDoublesPlayerIds);
							const team1Id = isRated
								? await getOrCreateDoubleTeam(doublesWinners[0], doublesWinners[1])
								: null;
							const team2Id = isRated
								? await getOrCreateDoubleTeam(singlesPlayerIds[0], singlesPlayerIds[1])
								: null;

							await adminClient
								.from("session_matches")
								.update({
									player_ids: newDoublesPlayerIds,
									team_1_id: team1Id,
									team_2_id: team2Id,
									is_rated: isRated,
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
									is_rated: isRatedPlayers(doublesLosers),
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
							const isRated = isRatedPlayers(newDoublesPlayerIds);
							const team1Id = isRated
								? await getOrCreateDoubleTeam(doublesLosers[0], doublesLosers[1])
								: null;
							const team2Id = isRated
								? await getOrCreateDoubleTeam(singlesPlayerIds[0], singlesPlayerIds[1])
								: null;

							await adminClient
								.from("session_matches")
								.update({
									player_ids: newDoublesPlayerIds,
									team_1_id: team1Id,
									team_2_id: team2Id,
									is_rated: isRated,
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
									is_rated: isRatedPlayers(doublesWinners),
								})
								.eq("id", round7SinglesMatch.id);
						}
					}
				}
			}
		}

		if (isLastRound) {
			await finalizeSessionMetadata(adminClient, sessionId);
		}

		await publishSuccessfulRound();
		// Success
		return NextResponse.json(atomicResponse);
	} catch (error) {
		submissionFailure = error;
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
	} finally {
		if (submissionId && submissionClaimToken && !submissionCompleted) {
			await failRoundSubmission(
				submissionId,
				submissionClaimToken,
				submissionFailure,
			);
		}
	}
}
