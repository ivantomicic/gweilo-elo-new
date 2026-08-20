import { NextRequest } from "next/server";
import { verifyAdmin, createAdminClient } from "@/lib/supabase/admin";
import {
	currentPendingRoundNumber,
	isValidFinalSetScore,
	roundMatches,
	roundSubmission,
	type ScorekeeperMatchRow,
} from "@/lib/sessions/scorekeeper";
import {
	scorekeeperOptions,
	scorekeeperResponse,
} from "@/lib/scorekeeper/http";

export const dynamic = "force-dynamic";

type MatchRecord = ScorekeeperMatchRow & {
	session_id: string;
};

export function OPTIONS(request: NextRequest) {
	return scorekeeperOptions(request);
}

export async function POST(
	request: NextRequest,
	{ params }: { params: { matchId: string } },
) {
	try {
		const authorization = request.headers.get("authorization");
		const adminUserID = await verifyAdmin(authorization);
		if (!adminUserID) {
			return scorekeeperResponse(
				request,
				{ error: "Administrator access is required." },
				{ status: 403 },
			);
		}

		const body = (await request.json()) as {
			team1Score?: unknown;
			team2Score?: unknown;
		};
		if (!isValidFinalSetScore(body.team1Score, body.team2Score)) {
			return scorekeeperResponse(
				request,
				{
					error:
						"Final set totals must be whole numbers between 0 and 999.",
				},
				{ status: 400 },
			);
		}
		const teamOneScore = Number(body.team1Score);
		const teamTwoScore = Number(body.team2Score);

		const admin = createAdminClient();
		const { data: rawMatch, error: matchError } = await admin
			.from("session_matches")
			.select(
				"id, session_id, round_number, match_order, status, team1_score, team2_score",
			)
			.eq("id", params.matchId)
			.maybeSingle();
		if (matchError) throw matchError;
		if (!rawMatch) {
			return scorekeeperResponse(
				request,
				{ error: "Match not found." },
				{ status: 404 },
			);
		}

		const match = rawMatch as MatchRecord;
		if (match.status === "completed") {
			const isSameResult =
				match.team1_score === teamOneScore &&
				match.team2_score === teamTwoScore;
			return scorekeeperResponse(
				request,
				isSameResult
					? { success: true, state: "already_committed" }
					: { error: "This match has already been completed." },
				{ status: isSameResult ? 200 : 409 },
			);
		}

		const { data: session, error: sessionError } = await admin
			.from("sessions")
			.select("id, status")
			.eq("id", match.session_id)
			.maybeSingle();
		if (sessionError) throw sessionError;
		if (!session || session.status !== "active") {
			return scorekeeperResponse(
				request,
				{ error: "The session is no longer active." },
				{ status: 409 },
			);
		}

		const { data: rawSessionMatches, error: sessionMatchesError } = await admin
			.from("session_matches")
			.select(
				"id, round_number, match_order, status, team1_score, team2_score",
			)
			.eq("session_id", match.session_id)
			.order("round_number", { ascending: true })
			.order("match_order", { ascending: true });
		if (sessionMatchesError) throw sessionMatchesError;

		const sessionMatches = (rawSessionMatches ?? []) as ScorekeeperMatchRow[];
		const currentRound = currentPendingRoundNumber(sessionMatches);
		if (currentRound === null || match.round_number !== currentRound) {
			return scorekeeperResponse(
				request,
				{ error: "Only matches in the current round can be scored." },
				{ status: 409 },
			);
		}

		const { error: updateError } = await admin
			.from("session_matches")
			.update({
				team1_score: teamOneScore,
				team2_score: teamTwoScore,
			})
			.eq("id", match.id)
			.eq("status", "pending");
		if (updateError) throw updateError;

		const { data: refreshedRound, error: refreshedRoundError } = await admin
			.from("session_matches")
			.select(
				"id, round_number, match_order, status, team1_score, team2_score",
			)
			.eq("session_id", match.session_id)
			.eq("round_number", currentRound)
			.order("match_order", { ascending: true });
		if (refreshedRoundError) throw refreshedRoundError;

		const pendingRoundMatches = roundMatches(
			(refreshedRound ?? []) as ScorekeeperMatchRow[],
			currentRound,
		);
		const submissions = roundSubmission(pendingRoundMatches);
		if (!submissions) {
			const waitingFor = pendingRoundMatches.filter(
				(candidate) =>
					!Number.isInteger(candidate.team1_score) ||
					!Number.isInteger(candidate.team2_score),
			).length;
			return scorekeeperResponse(request, {
				success: true,
				state: "match_staged",
				roundNumber: currentRound,
				waitingFor,
			});
		}

		const submitURL = new URL(
			`/api/sessions/${match.session_id}/rounds/${currentRound}/submit`,
			request.nextUrl.origin,
		);
		const submitResponse = await fetch(submitURL, {
			method: "POST",
			headers: {
				Authorization: authorization!,
				"Content-Type": "application/json",
				"X-Gweilo-Client": "scorekeeper",
			},
			body: JSON.stringify({ matchScores: submissions }),
			cache: "no-store",
		});
		const submitBody = await submitResponse.json().catch(() => ({}));

		if (submitResponse.ok) {
			return scorekeeperResponse(request, {
				success: true,
				state: "round_committed",
				roundNumber: currentRound,
				submission: submitBody,
			});
		}

		if (
			submitResponse.status === 409 &&
			typeof submitBody?.error === "string" &&
			submitBody.error.toLowerCase().includes("in progress")
		) {
			return scorekeeperResponse(
				request,
				{
					success: true,
					state: "round_finalizing",
					roundNumber: currentRound,
				},
				{ status: 202 },
			);
		}

		return scorekeeperResponse(
			request,
			{
				error:
					submitBody?.error ??
					submitBody?.details ??
					"The round could not be finalized.",
				state: "match_staged",
			},
			{ status: submitResponse.status },
		);
	} catch (error) {
		console.error("Failed to save scorekeeper result:", error);
		return scorekeeperResponse(
			request,
			{ error: "The match result could not be saved." },
			{ status: 500 },
		);
	}
}
