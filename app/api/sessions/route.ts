import { NextRequest, NextResponse } from "next/server";
import { getOrCreateDoubleTeam } from "@/lib/elo/double-teams";
import {
	buildAtomicSessionPayload,
	isValidIdempotencyKey,
	type SessionCreationBody,
	validateSessionCreation,
} from "@/lib/sessions/creation";
import {
	generateSchedule,
	getSixPlayerCandidateTeams,
} from "@/lib/sessions/schedule";
import {
	getPreferredRound5SinglesTeam,
	loadRecentRound5SinglesPairs,
} from "@/lib/sessions/round5-team";
import { notifySessionStarted } from "@/lib/notifications/events";
import { startSessionLiveActivitySafely } from "@/lib/live-activities/service";
import { createAdminClient, verifyUser } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type AtomicCreationResult = {
	state: "created" | "replayed" | "active_exists";
	sessionId: string;
};

/**
 * POST /api/sessions
 *
 * Creates and immediately starts a session. Custom/future dates are not
 * supported. Mods and admins only. The database atomically inserts the session,
 * players, matches, and idempotency record while enforcing one active session.
 */
export async function POST(request: NextRequest) {
	try {
		const auth = await verifyUser(request.headers.get("authorization"));
		if (!auth) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 },
			);
		}
		if (auth.role !== "admin" && auth.role !== "mod") {
			return NextResponse.json(
				{ error: "Only admins and mods can start sessions." },
				{ status: 403 },
			);
		}

		const idempotencyKey = request.headers.get("idempotency-key");
		if (!isValidIdempotencyKey(idempotencyKey)) {
			return NextResponse.json(
				{ error: "A valid Idempotency-Key header is required." },
				{ status: 400 },
			);
		}

		const body = (await request.json()) as SessionCreationBody;
		if (body.createdAt !== undefined) {
			return NextResponse.json(
				{ error: "Custom session dates are not supported." },
				{ status: 400 },
			);
		}

		const players = body.players ?? [];
		const playerCount = body.playerCount ?? players.length;
		let rounds = body.rounds;
		const adminClient = createAdminClient();

		const { data: replay } = await adminClient
			.from("session_creation_requests")
			.select("session_id")
			.eq("created_by", auth.userId)
			.eq("idempotency_key", idempotencyKey)
			.maybeSingle();
		if (replay?.session_id) {
			return NextResponse.json({
				sessionId: replay.session_id,
				message: "Session already created successfully",
				rounds: rounds ?? [],
				replayed: true,
			});
		}

		const { data: activeSession } = await adminClient
			.from("sessions")
			.select("id")
			.eq("status", "active")
			.order("created_at", { ascending: false })
			.limit(1)
			.maybeSingle();
		if (activeSession) {
			return NextResponse.json(
				{
					error: "A session is already active.",
					activeSessionId: activeSession.id,
				},
				{ status: 409 },
			);
		}

		if (!rounds) {
			let sixPlayerRound5SinglesTeam;
			const candidateTeams = getSixPlayerCandidateTeams(players);
			if (candidateTeams) {
				const recentPairs = await loadRecentRound5SinglesPairs(
					adminClient,
					auth.userId,
				);
				sixPlayerRound5SinglesTeam = getPreferredRound5SinglesTeam(
					candidateTeams,
					recentPairs,
				);
			}
			rounds = generateSchedule(players, {
				fourPlayerFormat: body.fourPlayerFormat,
				sixPlayerRound5SinglesTeam,
			});
		}

		const validationError = validateSessionCreation({
			players,
			rounds,
			playerCount,
		});
		if (validationError) {
			return NextResponse.json(
				{ error: validationError },
				{ status: 400 },
			);
		}

		const atomicPayload = await buildAtomicSessionPayload({
			players,
			rounds,
			resolveTeam: getOrCreateDoubleTeam,
		});
		const { data, error } = await adminClient.rpc("create_session_atomic", {
			p_created_by: auth.userId,
			p_idempotency_key: idempotencyKey,
			p_players: atomicPayload.players,
			p_matches: atomicPayload.matches,
		});
		if (error) {
			console.error("Atomic session creation failed:", error);
			return NextResponse.json(
				{ error: "Failed to create session." },
				{ status: 500 },
			);
		}

		const result = data as AtomicCreationResult;
		if (result.state === "active_exists") {
			return NextResponse.json(
				{
					error: "A session is already active.",
					activeSessionId: result.sessionId,
				},
				{ status: 409 },
			);
		}

		if (result.state === "created") {
			await Promise.all([
				notifySessionStarted({
					sessionId: result.sessionId,
					playerCount,
					createdBy: auth.userId,
				}),
				startSessionLiveActivitySafely(result.sessionId),
			]);
		}

		return NextResponse.json(
			{
				sessionId: result.sessionId,
				message:
					result.state === "replayed"
						? "Session already created successfully"
						: "Session created successfully",
				rounds,
				replayed: result.state === "replayed",
			},
			{ status: result.state === "created" ? 201 : 200 },
		);
	} catch (error) {
		console.error("Unexpected error in POST /api/sessions:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
