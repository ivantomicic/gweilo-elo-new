import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { getManagedRoleFromAuthUser } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { runMatchEditRecalculation } from "./recalculation";

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
	{ params }: { params: { sessionId: string; matchId: string } },
) {
	const adminClient = createAdminClient();

	try {
		const authHeader = request.headers.get("authorization");
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 },
			);
		}

		const token = authHeader.replace("Bearer ", "");
		const sessionId = params.sessionId;
		const matchId = params.matchId;

		if (!sessionId || !matchId) {
			return NextResponse.json(
				{ error: "Session ID and match ID are required" },
				{ status: 400 },
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
				{ status: 401 },
			);
		}

		// Verify user owns the session
		const { data: session, error: sessionError } = await supabase
			.from("sessions")
			.select("created_by, recalc_status, status, completed_at, player_count")
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
					error: "Unauthorized. You can only edit matches in your own sessions.",
				},
				{ status: 403 },
			);
		}

		// Guard: this endpoint only replays one session's matches, so editing older
		// completed sessions would overwrite global ratings for newer completed sessions.
		if (session.status === "completed") {
			const { data: latestCompletedSession, error: latestError } =
				await adminClient
					.from("sessions")
					.select("id")
					.eq("status", "completed")
					.order("completed_at", { ascending: false })
					.limit(1)
					.single();

			if (latestError || !latestCompletedSession) {
				return NextResponse.json(
					{
						error: "Cannot verify if this is the latest completed session",
					},
					{ status: 500 },
				);
			}

			if (latestCompletedSession.id !== sessionId) {
				return NextResponse.json(
					{
						error: "Only the latest completed session can be edited safely",
						latest_completed_session_id: latestCompletedSession.id,
					},
					{ status: 400 },
				);
			}
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
				{ status: 400 },
			);
		}

		if (session.player_count === 5) {
			const { data: sessionMatches, error: sessionMatchesError } =
				await adminClient
					.from("session_matches")
					.select("id, round_number, match_order")
					.eq("session_id", sessionId)
					.order("round_number", { ascending: true });

			if (sessionMatchesError) {
				return NextResponse.json(
					{ error: "Failed to verify 5-player session state" },
					{ status: 500 },
				);
			}

			const maxRoundNumber = (sessionMatches ?? []).reduce(
				(max, match) => Math.max(max, match.round_number),
				0,
			);

			if (maxRoundNumber >= 10) {
				const matchBeingEdited = (sessionMatches ?? []).find(
					(match) => match.id === matchId,
				);

				if (!matchBeingEdited) {
					return NextResponse.json(
						{ error: "Match not found in session" },
						{ status: 404 },
					);
				}

				const settlementMatch =
					matchBeingEdited.round_number <= 5
						? (sessionMatches ?? []).find(
								(match) =>
									match.round_number ===
										matchBeingEdited.round_number + 5 &&
									match.match_order === matchBeingEdited.match_order,
							)
						: matchBeingEdited;
				let hasSettlementHistory = false;

				if (settlementMatch) {
					const { data: existingHistory, error: historyLookupError } =
						await adminClient
							.from("match_elo_history")
							.select("match_id")
							.eq("match_id", settlementMatch.id)
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

					hasSettlementHistory = Boolean(existingHistory?.length);
				}

				if (!hasSettlementHistory && session.status === "active") {
					const { error: updateError } = await adminClient
						.from("session_matches")
						.update({
							team1_score: team1Score,
							team2_score: team2Score,
						})
						.eq("id", matchId)
						.eq("session_id", sessionId);

					if (updateError) {
						console.error(
							"Error updating deferred 5-player match score:",
							updateError,
						);
						return NextResponse.json(
							{ error: "Failed to update match score" },
							{ status: 500 },
						);
					}

					return NextResponse.json({
						success: true,
						message: "Match score updated",
						ratingsDeferred: true,
					});
				}

				return NextResponse.json(
					{
						error:
							"This paired 5-player result has already been rated. Edit an unsettled pair before submitting its second-half round.",
					},
					{ status: 409 },
				);
			}
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
					{ status: 409 },
				);
			}

			console.error("Lock acquisition failed:", lockError);
			return NextResponse.json(
				{
					error: "Failed to acquire recalculation lock",
					details: lockError?.message || "Unknown error",
				},
				{ status: 500 },
			);
		}

		const response = await runMatchEditRecalculation({
			adminClient,
			sessionId,
			matchId,
			team1Score,
			team2Score,
			reason,
			userId: user.id,
		});

		if (response.ok) {
			revalidateTag("statistics");
		}

		return response;
	} catch (error) {
		console.error(
			"Unexpected error in POST /api/sessions/[sessionId]/matches/[matchId]/edit:",
			error,
		);
		return NextResponse.json(
			{
				error: "Internal server error",
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 },
		);
	}
}
