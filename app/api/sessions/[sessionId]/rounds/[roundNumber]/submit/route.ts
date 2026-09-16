import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getManagedRoleFromAuthUser } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateDoubleTeam } from "@/lib/elo/double-teams";
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
	buildSixPlayerFutureRoundPlan,
	type FutureRoundMatchUpdate,
} from "@/lib/sessions/six-player-future-rounds";
import {
	combineTwoHalfSinglesScore,
	detectTwoHalfSinglesSession,
} from "@/lib/sessions/two-half-singles";
import { getAuthToken } from "../../../../../_utils/auth";
import { processPendingRoundEffects } from "@/lib/elo/round-effects";

export const maxDuration = 60;

type MatchScore = {
	matchId: string;
	team1Score: number;
	team2Score: number;
};

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
    props: { params: Promise<{ sessionId: string; roundNumber: string }> }
) {
    const params = await props.params;
    const adminClient = createAdminClient();
    let submissionId: string | undefined;
    let submissionClaimToken: string | undefined;
    let submissionCompleted = false;
    let submissionFailure: unknown = "Round submission did not complete";
    const scheduleRoundEffects = (targetSubmissionId: string) => after(() =>
        processPendingRoundEffects(1, targetSubmissionId).catch((effectError) => {
            console.error("Post-response round effects failed:", effectError);
        })
    );

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
				.select("id, status, response, effects_status")
				.eq("session_id", sessionId)
				.eq("round_number", roundNum)
				.maybeSingle();
		if (existingSubmissionError) {
			throw new Error(
				`Failed to check round submission state: ${existingSubmissionError.message}`,
			);
		}
		if (existingSubmission?.status === "completed") {
			if (existingSubmission.effects_status === "pending") scheduleRoundEffects(existingSubmission.id);
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

		const excludeSubmittingUserIds =
			request.headers.get("x-gweilo-client")?.toLowerCase() === "ios"
				? [user.id]
				: [];
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
		const maxRoundNumber = Math.max(
			...sessionMatchesForPairing.map((match) => match.round_number),
		);
		const isLastRound = roundNum >= maxRoundNumber;
		const nextRound = sessionMatchesForPairing
			.map((match) => match.round_number)
			.filter((number) => number > roundNum)
			.sort((left, right) => left - right)[0] ?? null;
		const twoHalfSinglesConfig = detectTwoHalfSinglesSession(
			session.player_count,
			sessionMatchesForPairing as SessionMatchRecord[],
		);
		let futureMatches: FutureRoundMatchUpdate[] = [];
		if (!twoHalfSinglesConfig && roundNum === 5 && session.player_count === 6) {
			const { data: placeholders, error: placeholdersError } = await adminClient
				.from("session_placeholders")
				.select("id")
				.eq("session_id", sessionId);
			if (placeholdersError) throw placeholdersError;
			const roundFiveDoubles = matches.find((match) => match.match_type === "doubles");
			if (!roundFiveDoubles) throw new Error("Round 5 doubles match is missing");
			const doublesScore = matchScoresMap.get(roundFiveDoubles.id)!;
			futureMatches = await buildSixPlayerFutureRoundPlan({
				matches: sessionMatchesForPairing.map((match) => ({
					...match,
					player_ids: normalizePlayerIDs(match.player_ids),
				})),
				doublesTeamOneScore: doublesScore.team1Score,
				doublesTeamTwoScore: doublesScore.team2Score,
				placeholderIds: new Set((placeholders ?? []).map((placeholder) => placeholder.id)),
				resolveDoublesTeam: getOrCreateDoubleTeam,
			});
		}
		const receipt = {
			completedRound: roundNum,
			nextRound,
			sessionStatus: isLastRound ? "completed" : "active",
			futureMatches,
		};
		const submissionClaim = await claimRoundSubmission(sessionId, roundNum);

		if (submissionClaim.state === "completed") {
			scheduleRoundEffects(submissionClaim.submissionId);
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
			const { data, error } = await adminClient.rpc("commit_atomic_elo_round_with_effects", {
				p_session_id: sessionId,
				p_round_number: roundNum,
				p_submission_id: submissionId!,
				p_claim_token: submissionClaimToken!,
				p_plan: { ...plan, future_matches: futureMatches },
				p_response: { ...response, ...receipt },
				p_complete_session: isLastRound,
				p_effects_payload: {
					sessionId,
					createdBy: user.id,
					isLastRound,
					excludeUserIds: excludeSubmittingUserIds,
				},
			});
			if (error) throw new Error(`Atomic ELO commit failed: ${error.message}`);
			submissionCompleted = true;
			scheduleRoundEffects(submissionId!);
			return (data ?? { ...response, ...receipt }) as Record<string, unknown>;
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

			return NextResponse.json(atomicResponse);
		}

		const atomicResponse = await commitAtomicSubmission({
			response: { success: true, message: "Round submitted successfully" },
		});

		// The transaction already committed scores, future matchups, and a durable
		// outbox entry. Never hold the receipt for ancillary work.
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
