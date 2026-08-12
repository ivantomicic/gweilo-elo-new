import { NextRequest, NextResponse } from "next/server";
import { calculateExpectedScore } from "@/lib/elo/calculation";
import {
	calculateOpportunityAdjustedFormBreakdown,
	classifyOpportunityAdjustedForm,
	type FormPerformanceObservation,
} from "@/lib/elo/form";
import {
	detectTwoHalfSinglesSession,
	getEffectiveTwoHalfSinglesScore,
	type TwoHalfSinglesConfig,
} from "@/lib/sessions/two-half-singles";
import { createAdminClient, verifyAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const DEFAULT_SESSION_LIMIT = 12;
const MAX_SESSION_LIMIT = 30;
const NO_STORE_HEADERS = {
	"Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
	"CDN-Cache-Control": "no-store",
	"Vercel-CDN-Cache-Control": "no-store",
	Pragma: "no-cache",
	Vary: "Authorization",
};

type AuditSession = {
	id: string;
	created_at: string;
	completed_at: string | null;
	player_count: number;
};

type AuditMatch = {
	id: string;
	session_id: string;
	match_type: "singles" | "doubles";
	round_number: number;
	match_order: number;
	player_ids: string[] | null;
	team1_score: number | null;
	team2_score: number | null;
};

type AuditHistory = {
	match_id: string;
	player1_id: string | null;
	player2_id: string | null;
	player1_elo_before: number | string | null;
	player2_elo_before: number | string | null;
	player1_elo_delta: number | string | null;
	player2_elo_delta: number | string | null;
};

type AuditProfile = {
	id: string;
	display_name: string | null;
	avatar_url: string | null;
};

type AuditMatchDetail = {
	matchId: string;
	roundNumber: number;
	matchOrder: number;
	opponentId: string;
	opponentName: string;
	result: "win" | "draw" | "loss";
	score: string;
	actualScore: number;
	expectedScore: number;
	performanceAboveExpectation: number;
	eloDelta: number;
};

type AuditGroup = {
	playerId: string;
	sessionId: string;
	observations: FormPerformanceObservation[];
	matches: AuditMatchDetail[];
};

const toNumber = (value: number | string | null, fallback = 0) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const round = (value: number, precision = 3) => {
	const factor = 10 ** precision;
	return Math.round((value + Number.EPSILON) * factor) / factor;
};

function getSessionLimit(request: NextRequest) {
	const requested = Number(request.nextUrl.searchParams.get("limit"));
	if (!Number.isInteger(requested)) return DEFAULT_SESSION_LIMIT;
	return Math.min(MAX_SESSION_LIMIT, Math.max(1, requested));
}

function resolveTwoHalfConfig(
	session: AuditSession,
	matches: AuditMatch[],
): TwoHalfSinglesConfig | null {
	const matchesWithPlayers = matches.filter(
		(match): match is AuditMatch & { player_ids: string[] } =>
			match.player_ids !== null,
	);
	if (matchesWithPlayers.length !== matches.length) return null;
	return detectTwoHalfSinglesSession(
		session.player_count,
		matchesWithPlayers,
	);
}

function resolveSinglesScore(
	match: AuditMatch,
	sessionMatches: AuditMatch[],
	config: TwoHalfSinglesConfig | null,
) {
	if (!match.player_ids) return null;
	const matchesWithPlayers = sessionMatches.filter(
		(candidate): candidate is AuditMatch & { player_ids: string[] } =>
			candidate.player_ids !== null,
	);
	return getEffectiveTwoHalfSinglesScore(
		{ ...match, player_ids: match.player_ids },
		matchesWithPlayers,
		config,
	);
}

function addPlayerMatch(
	groups: Map<string, AuditGroup>,
	match: AuditMatch,
	playerId: string | null,
	opponentId: string | null,
	playerBefore: number,
	opponentBefore: number,
	eloDelta: number,
	effectiveScore: { team1Score: number; team2Score: number },
	profiles: Map<string, AuditProfile>,
) {
	if (!playerId || !opponentId || !match.player_ids) return;
	const playerIndex = match.player_ids.indexOf(playerId);
	if (playerIndex < 0 || playerIndex > 1) return;

	const playerIsTeamOne = playerIndex === 0;
	const ownScore = playerIsTeamOne
		? effectiveScore.team1Score
		: effectiveScore.team2Score;
	const opponentScore = playerIsTeamOne
		? effectiveScore.team2Score
		: effectiveScore.team1Score;
	const actualScore = ownScore > opponentScore ? 1 : ownScore < opponentScore ? 0 : 0.5;
	const expectedScore = calculateExpectedScore(playerBefore, opponentBefore);
	const groupKey = `${match.session_id}:${playerId}`;
	const group = groups.get(groupKey) ?? {
		playerId,
		sessionId: match.session_id,
		observations: [],
		matches: [],
	};

	group.observations.push({ actualScore, expectedScore });
	group.matches.push({
		matchId: match.id,
		roundNumber: match.round_number,
		matchOrder: match.match_order,
		opponentId,
		opponentName:
			profiles.get(opponentId)?.display_name ?? `Player ${opponentId.slice(0, 6)}`,
		result: actualScore === 1 ? "win" : actualScore === 0 ? "loss" : "draw",
		score: `${ownScore}–${opponentScore}`,
		actualScore,
		expectedScore: round(expectedScore),
		performanceAboveExpectation: round(actualScore - expectedScore),
		eloDelta: round(eloDelta, 2),
	});
	groups.set(groupKey, group);
}

export async function GET(request: NextRequest) {
	try {
		const adminUserId = await verifyAdmin(
			request.headers.get("authorization"),
		);
		if (!adminUserId) {
			return NextResponse.json(
				{ error: "Unauthorized. Admin access required." },
				{ status: 401, headers: NO_STORE_HEADERS },
			);
		}

		const adminClient = createAdminClient();
		const { data: sessionData, error: sessionsError } = await adminClient
			.from("sessions")
			.select("id, created_at, completed_at, player_count")
			.eq("status", "completed")
			.order("created_at", { ascending: false })
			.limit(getSessionLimit(request));
		if (sessionsError) throw sessionsError;

		const sessions = (sessionData ?? []) as AuditSession[];
		if (sessions.length === 0) {
			return NextResponse.json(
				{ entries: [], players: [], sessions: [] },
				{ headers: NO_STORE_HEADERS },
			);
		}

		const sessionIds = sessions.map((session) => session.id);
		const { data: matchData, error: matchesError } = await adminClient
			.from("session_matches")
			.select(
				"id, session_id, match_type, round_number, match_order, player_ids, team1_score, team2_score",
			)
			.in("session_id", sessionIds)
			.eq("status", "completed");
		if (matchesError) throw matchesError;

		const matches = (matchData ?? []) as AuditMatch[];
		const matchIds = matches.map((match) => match.id);
		if (matchIds.length === 0) {
			return NextResponse.json(
				{ entries: [], players: [], sessions },
				{ headers: NO_STORE_HEADERS },
			);
		}

		const playerIds = Array.from(
			new Set(
				matches.flatMap((match) => match.player_ids ?? []),
			),
		);
		const [historyResult, profilesResult] = await Promise.all([
			adminClient
				.from("match_elo_history")
				.select(
					"match_id, player1_id, player2_id, player1_elo_before, player2_elo_before, player1_elo_delta, player2_elo_delta",
				)
				.in("match_id", matchIds),
			playerIds.length > 0
				? adminClient
						.from("profiles")
						.select("id, display_name, avatar_url")
						.in("id", playerIds)
				: Promise.resolve({ data: [], error: null }),
		]);
		if (historyResult.error) throw historyResult.error;
		if (profilesResult.error) throw profilesResult.error;

		const histories = (historyResult.data ?? []) as AuditHistory[];
		const profiles = new Map(
			((profilesResult.data ?? []) as AuditProfile[]).map((profile) => [
				profile.id,
				profile,
			]),
		);
		const sessionMap = new Map(sessions.map((session) => [session.id, session]));
		const matchesBySession = new Map<string, AuditMatch[]>();
		for (const match of matches) {
			const sessionMatches = matchesBySession.get(match.session_id) ?? [];
			sessionMatches.push(match);
			matchesBySession.set(match.session_id, sessionMatches);
		}
		const twoHalfConfigs = new Map(
			sessions.map((session) => [
				session.id,
				resolveTwoHalfConfig(
					session,
					matchesBySession.get(session.id) ?? [],
				),
			]),
		);
		const matchMap = new Map(matches.map((match) => [match.id, match]));
		const groups = new Map<string, AuditGroup>();

		for (const history of histories) {
			const match = matchMap.get(history.match_id);
			if (!match || match.match_type !== "singles") continue;
			const effectiveScore = resolveSinglesScore(
				match,
				matchesBySession.get(match.session_id) ?? [],
				twoHalfConfigs.get(match.session_id) ?? null,
			);
			if (!effectiveScore) continue;

			const player1Before = toNumber(history.player1_elo_before, Number.NaN);
			const player2Before = toNumber(history.player2_elo_before, Number.NaN);
			if (!Number.isFinite(player1Before) || !Number.isFinite(player2Before)) {
				continue;
			}

			addPlayerMatch(
				groups,
				match,
				history.player1_id,
				history.player2_id,
				player1Before,
				player2Before,
				toNumber(history.player1_elo_delta),
				effectiveScore,
				profiles,
			);
			addPlayerMatch(
				groups,
				match,
				history.player2_id,
				history.player1_id,
				player2Before,
				player1Before,
				toNumber(history.player2_elo_delta),
				effectiveScore,
				profiles,
			);
		}

		const entries = Array.from(groups.values())
			.map((group) => {
				const session = sessionMap.get(group.sessionId)!;
				const profile = profiles.get(group.playerId);
				const breakdown = calculateOpportunityAdjustedFormBreakdown(
					group.observations,
				);
				const wins = group.matches.filter((match) => match.result === "win").length;
				const draws = group.matches.filter((match) => match.result === "draw").length;
				const losses = group.matches.length - wins - draws;
				return {
					id: `${group.sessionId}:${group.playerId}`,
					player: {
						id: group.playerId,
						name:
							profile?.display_name ?? `Player ${group.playerId.slice(0, 6)}`,
						avatar: profile?.avatar_url ?? null,
					},
					session: {
						id: session.id,
						date: session.completed_at ?? session.created_at,
					},
					record: { wins, draws, losses },
					eloDelta: round(
						group.matches.reduce((sum, match) => sum + match.eloDelta, 0),
						2,
					),
					formScore: round(breakdown.score),
					classification: classifyOpportunityAdjustedForm(breakdown.score),
					calculation: {
						actualScore: round(breakdown.actualScore),
						expectedScore: round(breakdown.expectedScore),
						performanceAboveExpectation: round(
							breakdown.performanceAboveExpectation,
						),
						availableOpportunity: round(breakdown.availableOpportunity),
					},
					matches: group.matches.sort(
						(left, right) =>
							left.roundNumber - right.roundNumber ||
							left.matchOrder - right.matchOrder,
					),
				};
			})
			.sort(
				(left, right) =>
					new Date(right.session.date).getTime() -
						new Date(left.session.date).getTime() ||
					left.player.name.localeCompare(right.player.name),
			);

		const playerOptions = Array.from(
			new Map(entries.map((entry) => [entry.player.id, entry.player])).values(),
		).sort((left, right) => left.name.localeCompare(right.name));

		return NextResponse.json(
			{
				entries,
				players: playerOptions,
				sessions: sessions.map((session) => ({
					id: session.id,
					date: session.completed_at ?? session.created_at,
				})),
			},
			{ headers: NO_STORE_HEADERS },
		);
	} catch (error) {
		console.error("Unexpected error in GET /api/admin/form-audit:", error);
		return NextResponse.json(
			{ error: "Failed to load form audit" },
			{ status: 500, headers: NO_STORE_HEADERS },
		);
	}
}
