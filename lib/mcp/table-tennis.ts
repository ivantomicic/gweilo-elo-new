import type { SupabaseClient } from "@supabase/supabase-js";
import {
	calculateEloDelta,
	calculateExpectedScore,
	calculateKFactor,
	type MatchResult,
} from "@/lib/elo/calculation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
	aggregateGeneralSinglesStatistics,
	aggregateRivalries,
	serializeJsonbPlayerIdsContainment,
	resolveOpponentMatchesByName,
	summarizeScopedMatches,
	toScopedSinglesMatch,
	type GeneralStatisticsSort,
	type PeriodEloChange,
	type PlayerMatchElo,
	type RivalrySort,
	type ScopedSinglesMatch,
	type SinglesMatchRecord,
} from "@/lib/mcp/table-tennis-stats";
import { getActiveSinglesPlayerIds } from "@/lib/statistics/active-singles";
import {
	MAX_SINGLES_INACTIVITY_DAYS,
	MIN_SINGLES_MATCHES,
} from "@/lib/statistics/min-matches";

const MATCH_PAGE_SIZE = 500;
const MAX_HEAD_TO_HEAD_MATCHES = 5000;
const MAX_PERIOD_MATCHES = 5000;
const ELO_HISTORY_BATCH_SIZE = 200;

type ProfileRecord = {
	id: string;
	display_name: string | null;
};

type RatingRecord = {
	player_id: string;
	matches_played: number | null;
	wins: number | null;
	losses: number | null;
	draws: number | null;
	sets_won: number | null;
	sets_lost: number | null;
	elo: number | string | null;
};

type DatabaseMatchRecord = {
	id?: string;
	player_ids: unknown;
	team1_score: number | string | null;
	team2_score: number | string | null;
	created_at: string | null;
};

type DatabaseEloHistoryRecord = {
	match_id: string;
	player1_id: string;
	player2_id: string;
	player1_elo_before: number | string | null;
	player1_elo_after: number | string | null;
	player1_elo_delta: number | string | null;
	player2_elo_before: number | string | null;
	player2_elo_after: number | string | null;
	player2_elo_delta: number | string | null;
};

type SessionRatingSnapshotRecord = Omit<RatingRecord, "player_id"> & {
	entity_id: string;
};

export class McpTableTennisError extends Error {
	constructor(
		message: string,
		public readonly code:
			| "NOT_FOUND"
			| "AMBIGUOUS_OPPONENT"
			| "INVALID_OPPONENT"
			| "DATA_UNAVAILABLE" = "DATA_UNAVAILABLE",
	) {
		super(message);
		this.name = "McpTableTennisError";
	}
}

function toFiniteNumber(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}

	return null;
}

function normalizePlayerIds(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter((id): id is string => typeof id === "string");
	}

	if (typeof value === "string") {
		try {
			return normalizePlayerIds(JSON.parse(value));
		} catch {
			return [];
		}
	}

	return [];
}

function normalizeDatabaseMatch(
	match: DatabaseMatchRecord,
): SinglesMatchRecord | null {
	const team1Score = toFiniteNumber(match.team1_score);
	const team2Score = toFiniteNumber(match.team2_score);
	const playerIds = normalizePlayerIds(match.player_ids);

	if (team1Score === null || team2Score === null || playerIds.length !== 2) {
		return null;
	}

	return {
		...(match.id ? { id: match.id } : {}),
		player_ids: playerIds,
		team1_score: team1Score,
		team2_score: team2Score,
		created_at: match.created_at,
	};
}

async function getProfilesMap(
	adminClient: SupabaseClient,
	playerIds: string[],
) {
	if (playerIds.length === 0) {
		return new Map<string, string>();
	}

	const { data, error } = await adminClient
		.from("profiles")
		.select("id, display_name")
		.in("id", Array.from(new Set(playerIds)));

	if (error) {
		throw new McpTableTennisError("Player names are temporarily unavailable.");
	}

	return new Map(
		((data || []) as ProfileRecord[]).map((profile) => [
			profile.id,
			profile.display_name || "Unknown player",
		]),
	);
}

function ratingValue(value: number | string | null | undefined, fallback = 0) {
	return toFiniteNumber(value) ?? fallback;
}

function formatCurrentRating(
	rating: RatingRecord | undefined,
	displayName: string,
) {
	const matchesPlayed = rating?.matches_played ?? 0;
	const wins = rating?.wins ?? 0;
	const losses = rating?.losses ?? 0;
	const draws = rating?.draws ?? 0;
	const setsWon = rating?.sets_won ?? 0;
	const setsLost = rating?.sets_lost ?? 0;

	return {
		display_name: displayName,
		current_elo: roundToTwo(ratingValue(rating?.elo, 1500)),
		matches_played: matchesPlayed,
		wins,
		losses,
		draws,
		win_rate_percent:
			matchesPlayed > 0
				? Math.round((wins / matchesPlayed) * 1000) / 10
				: 0,
		sets_won: setsWon,
		sets_lost: setsLost,
		set_difference: setsWon - setsLost,
	};
}

async function loadCurrentSinglesRanking(
	adminClient: SupabaseClient,
	userId: string,
) {
	const [
		ratingsResult,
		ownProfileResult,
		activePlayerIds,
		latestCompletedSessionResult,
	] = await Promise.all([
		adminClient
			.from("player_ratings")
			.select(
				"player_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost",
			),
		adminClient
			.from("profiles")
			.select("id, display_name")
			.eq("id", userId)
			.maybeSingle(),
		getActiveSinglesPlayerIds(adminClient),
		adminClient
			.from("sessions")
			.select("id, completed_at")
			.eq("status", "completed")
			.not("completed_at", "is", null)
			.order("completed_at", { ascending: false })
			.limit(1)
			.maybeSingle(),
	]);

	if (
		ratingsResult.error ||
		ownProfileResult.error ||
		latestCompletedSessionResult.error
	) {
		throw new McpTableTennisError(
			"Current singles rankings are temporarily unavailable.",
		);
	}

	let ratings = (ratingsResult.data || []) as RatingRecord[];
	let ratingAsOf: string | null = null;
	const latestCompletedSession = latestCompletedSessionResult.data as {
		id: string;
		completed_at: string;
	} | null;

	if (latestCompletedSession) {
		const snapshotResult = await adminClient
			.from("session_rating_snapshots")
			.select(
				"entity_id, elo, matches_played, wins, losses, draws, sets_won, sets_lost",
			)
			.eq("session_id", latestCompletedSession.id)
			.eq("entity_type", "player_singles");

		if (!snapshotResult.error && snapshotResult.data?.length) {
			ratings = (
				snapshotResult.data as SessionRatingSnapshotRecord[]
			).map(({ entity_id: playerId, ...rating }) => ({
				...rating,
				player_id: playerId,
			}));
			ratingAsOf = latestCompletedSession.completed_at;
		}
	}

	const profiles = await getProfilesMap(
		adminClient,
		ratings.map((rating) => rating.player_id),
	);
	const eligibleRatings = ratings
		.filter(
			(rating) =>
				(rating.matches_played ?? 0) >= MIN_SINGLES_MATCHES &&
				activePlayerIds.has(rating.player_id),
		)
		.sort(
			(left, right) =>
				ratingValue(right.elo, 1500) - ratingValue(left.elo, 1500) ||
				left.player_id.localeCompare(right.player_id),
		);
	const rankedPlayers = eligibleRatings.map((rating, index) => ({
		rank: index + 1,
		player_id: rating.player_id,
		...formatCurrentRating(
			rating,
			profiles.get(rating.player_id) || "Unknown player",
		),
	}));
	const ownRating = ratings.find((rating) => rating.player_id === userId);
	const ownProfile = ownProfileResult.data as ProfileRecord | null;
	const ownRank = rankedPlayers.find((player) => player.player_id === userId);
	const ownIsActive = activePlayerIds.has(userId);
	const ownMatchesPlayed = ownRating?.matches_played ?? 0;

	return {
		ratingAsOf,
		eligibility: {
			minimum_matches: MIN_SINGLES_MATCHES,
			maximum_inactivity_days: MAX_SINGLES_INACTIVITY_DAYS,
		},
		rankedPlayers,
		currentPlayer: {
			...formatCurrentRating(
				ownRating,
				ownProfile?.display_name ||
					profiles.get(userId) ||
					"Unknown player",
			),
			rank: ownRank?.rank ?? null,
			ranking_eligible: Boolean(ownRank),
			eligibility_status: {
				has_minimum_matches: ownMatchesPlayed >= MIN_SINGLES_MATCHES,
				is_recently_active: ownIsActive,
				matches_needed: Math.max(
					0,
					MIN_SINGLES_MATCHES - ownMatchesPlayed,
				),
			},
		},
	};
}

async function loadRecentMatchRows(
	adminClient: SupabaseClient,
	userId: string,
	limit: number,
) {
	const { data, error } = await adminClient
		.from("session_matches")
		.select("id, player_ids, team1_score, team2_score, created_at")
		.eq("match_type", "singles")
		.eq("status", "completed")
		.contains(
			"player_ids",
			serializeJsonbPlayerIdsContainment([userId]),
		)
		.not("team1_score", "is", null)
		.not("team2_score", "is", null)
		.order("created_at", { ascending: false })
		.limit(limit);

	if (error) {
		throw new McpTableTennisError("Recent matches are temporarily unavailable.");
	}

	return (data || []) as DatabaseMatchRecord[];
}

async function loadHeadToHeadRows(
	adminClient: SupabaseClient,
	userId: string,
	opponentId: string,
) {
	const rows: DatabaseMatchRecord[] = [];

	for (let from = 0; from < MAX_HEAD_TO_HEAD_MATCHES; from += MATCH_PAGE_SIZE) {
		const { data, error } = await adminClient
			.from("session_matches")
			.select("id, player_ids, team1_score, team2_score, created_at")
			.eq("match_type", "singles")
			.eq("status", "completed")
			.contains(
				"player_ids",
				serializeJsonbPlayerIdsContainment([userId, opponentId]),
			)
			.not("team1_score", "is", null)
			.not("team2_score", "is", null)
			.order("created_at", { ascending: false })
			.range(from, from + MATCH_PAGE_SIZE - 1);

		if (error) {
			throw new McpTableTennisError(
				"Head-to-head data is temporarily unavailable.",
			);
		}

		const page = (data || []) as DatabaseMatchRecord[];
		rows.push(...page);
		if (page.length < MATCH_PAGE_SIZE) {
			return rows;
		}
	}

	throw new McpTableTennisError(
		"Head-to-head history is too large for this pilot endpoint.",
	);
}

async function loadOwnMatchHistoryRows(
	adminClient: SupabaseClient,
	userId: string,
) {
	const rows: DatabaseMatchRecord[] = [];

	for (let from = 0; from < MAX_HEAD_TO_HEAD_MATCHES; from += MATCH_PAGE_SIZE) {
		const { data, error } = await adminClient
			.from("session_matches")
			.select("id, player_ids, team1_score, team2_score, created_at")
			.eq("match_type", "singles")
			.eq("status", "completed")
			.contains(
				"player_ids",
				serializeJsonbPlayerIdsContainment([userId]),
			)
			.not("team1_score", "is", null)
			.not("team2_score", "is", null)
			.order("created_at", { ascending: false })
			.range(from, from + MATCH_PAGE_SIZE - 1);

		if (error) {
			throw new McpTableTennisError(
				"Head-to-head data is temporarily unavailable.",
			);
		}

		const page = (data || []) as DatabaseMatchRecord[];
		rows.push(...page);
		if (page.length < MATCH_PAGE_SIZE) {
			return rows;
		}
	}

	throw new McpTableTennisError(
		"Match history is too large for this pilot endpoint.",
	);
}

async function loadPeriodMatchRows(
	adminClient: SupabaseClient,
	periodStart: string,
	periodEnd: string,
) {
	const rows: DatabaseMatchRecord[] = [];

	for (let from = 0; from < MAX_PERIOD_MATCHES; from += MATCH_PAGE_SIZE) {
		const { data, error } = await adminClient
			.from("session_matches")
			.select("id, player_ids, team1_score, team2_score, created_at")
			.eq("match_type", "singles")
			.eq("status", "completed")
			.gte("created_at", periodStart)
			.lte("created_at", periodEnd)
			.not("team1_score", "is", null)
			.not("team2_score", "is", null)
			.order("created_at", { ascending: false })
			.range(from, from + MATCH_PAGE_SIZE - 1);

		if (error) {
			throw new McpTableTennisError(
				"General statistics are temporarily unavailable.",
			);
		}

		const page = (data || []) as DatabaseMatchRecord[];
		rows.push(...page);
		if (page.length < MATCH_PAGE_SIZE) {
			return rows;
		}
	}

	throw new McpTableTennisError(
		"Too many matches were found for this statistics period.",
	);
}

async function loadOwnPeriodMatchRows(
	adminClient: SupabaseClient,
	userId: string,
	periodStart: string,
	periodEnd: string,
) {
	const rows: DatabaseMatchRecord[] = [];

	for (let from = 0; from < MAX_PERIOD_MATCHES; from += MATCH_PAGE_SIZE) {
		const { data, error } = await adminClient
			.from("session_matches")
			.select("id, player_ids, team1_score, team2_score, created_at")
			.eq("match_type", "singles")
			.eq("status", "completed")
			.contains(
				"player_ids",
				serializeJsonbPlayerIdsContainment([userId]),
			)
			.gte("created_at", periodStart)
			.lte("created_at", periodEnd)
			.not("team1_score", "is", null)
			.not("team2_score", "is", null)
			.order("created_at", { ascending: false })
			.range(from, from + MATCH_PAGE_SIZE - 1);

		if (error) {
			throw new McpTableTennisError(
				"Personal Elo trend is temporarily unavailable.",
			);
		}

		const page = (data || []) as DatabaseMatchRecord[];
		rows.push(...page);
		if (page.length < MATCH_PAGE_SIZE) return rows;
	}

	throw new McpTableTennisError(
		"Too many matches were found for this Elo trend period.",
	);
}

function roundToTwo(value: number) {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function loadEloHistoryRows(
	adminClient: SupabaseClient,
	matchIds: string[],
) {
	const rows: DatabaseEloHistoryRecord[] = [];

	for (
		let offset = 0;
		offset < matchIds.length;
		offset += ELO_HISTORY_BATCH_SIZE
	) {
		const batch = matchIds.slice(offset, offset + ELO_HISTORY_BATCH_SIZE);
		const { data, error } = await adminClient
			.from("match_elo_history")
			.select(
				"match_id, player1_id, player2_id, player1_elo_before, player1_elo_after, player1_elo_delta, player2_elo_before, player2_elo_after, player2_elo_delta",
			)
			.in("match_id", batch);

		if (error) {
			throw new McpTableTennisError(
				"Elo history is temporarily unavailable.",
			);
		}

		rows.push(...((data || []) as DatabaseEloHistoryRecord[]));
	}

	return rows;
}

function buildMatchEloMap(rows: DatabaseEloHistoryRecord[]) {
	const matches = new Map<string, Map<string, PlayerMatchElo>>();

	for (const row of rows) {
		const players = matches.get(row.match_id) || new Map<string, PlayerMatchElo>();
		players.set(row.player1_id, {
			before: toFiniteNumber(row.player1_elo_before),
			after: toFiniteNumber(row.player1_elo_after),
			change: toFiniteNumber(row.player1_elo_delta),
		});
		players.set(row.player2_id, {
			before: toFiniteNumber(row.player2_elo_before),
			after: toFiniteNumber(row.player2_elo_after),
			change: toFiniteNumber(row.player2_elo_delta),
		});
		matches.set(row.match_id, players);
	}

	return matches;
}

function summarizePeriodEloChanges(rows: DatabaseEloHistoryRecord[]) {
	const changes = new Map<
		string,
		{
			eloPointsGained: number;
			eloPointsLost: number;
			netEloChange: number;
			matchIds: Set<string>;
		}
	>();

	const addDelta = (
		playerId: string,
		matchId: string,
		rawDelta: number | string | null,
	) => {
		const delta = toFiniteNumber(rawDelta);
		if (delta === null) return;

		const current = changes.get(playerId) || {
			eloPointsGained: 0,
			eloPointsLost: 0,
			netEloChange: 0,
			matchIds: new Set<string>(),
		};
		if (delta > 0) current.eloPointsGained += delta;
		else if (delta < 0) current.eloPointsLost += Math.abs(delta);
		current.netEloChange += delta;
		current.matchIds.add(matchId);
		changes.set(playerId, current);
	};

	for (const row of rows) {
		addDelta(row.player1_id, row.match_id, row.player1_elo_delta);
		addDelta(row.player2_id, row.match_id, row.player2_elo_delta);
	}

	return new Map<string, PeriodEloChange>(
		Array.from(changes.entries()).map(([playerId, change]) => [
			playerId,
			{
				eloPointsGained: roundToTwo(change.eloPointsGained),
				eloPointsLost: roundToTwo(change.eloPointsLost),
				netEloChange: roundToTwo(change.netEloChange),
				matchIds: change.matchIds,
			},
		]),
	);
}

async function formatMatchesForUser(
	adminClient: SupabaseClient,
	userId: string,
	rows: DatabaseMatchRecord[],
) {
	const normalized = rows
		.map(normalizeDatabaseMatch)
		.filter((match): match is SinglesMatchRecord => match !== null);
	const opponentIds = normalized
		.map((match) => match.player_ids.find((id) => id !== userId))
		.filter((id): id is string => Boolean(id));
	const matchIds = normalized
		.map((match) => match.id)
		.filter((matchId): matchId is string => Boolean(matchId));
	const [profiles, historyRows] = await Promise.all([
		getProfilesMap(adminClient, opponentIds),
		loadEloHistoryRows(adminClient, matchIds),
	]);
	const eloByMatch = buildMatchEloMap(historyRows);

	return normalized
		.map((match) => {
			const opponentId =
				match.player_ids.find((id) => id !== userId) || "";
			return toScopedSinglesMatch(
				match,
				userId,
				profiles.get(opponentId) || "Unknown player",
				match.id ? eloByMatch.get(match.id)?.get(userId) : undefined,
			);
		})
		.filter((match): match is ScopedSinglesMatch => match !== null);
}

export async function getOwnRecentMatches(userId: string, limit: number) {
	const adminClient = createAdminClient();
	const rows = await loadRecentMatchRows(adminClient, userId, limit);
	const matches = await formatMatchesForUser(adminClient, userId, rows);

	return {
		mode: "singles" as const,
		returned_matches: matches.length,
		matches,
	};
}

export async function getOwnPerformanceSummary(
	userId: string,
	recentLimit: number,
) {
	const adminClient = createAdminClient();
	const [ranking, recentRows] = await Promise.all([
		loadCurrentSinglesRanking(adminClient, userId),
		loadRecentMatchRows(adminClient, userId, recentLimit),
	]);
	const recentMatches = await formatMatchesForUser(
		adminClient,
		userId,
		recentRows,
	);
	const current = ranking.currentPlayer;
	const recentEloChanges = recentMatches
		.map((match) => match.elo_change)
		.filter((change): change is number => change !== null);

	return {
		mode: "singles" as const,
		player: {
			display_name: current.display_name,
		},
		rating_as_of: ranking.ratingAsOf,
		current_elo: current.current_elo,
		rank: current.rank,
		ranking_eligible: current.ranking_eligible,
		eligibility: ranking.eligibility,
		eligibility_status: current.eligibility_status,
		matches_played: current.matches_played,
		wins: current.wins,
		losses: current.losses,
		draws: current.draws,
		win_rate_percent: current.win_rate_percent,
		sets_won: current.sets_won,
		sets_lost: current.sets_lost,
		set_difference: current.set_difference,
		recent_form: recentMatches.map((match) => match.result),
		recent_elo_change: roundToTwo(
			recentEloChanges.reduce((total, change) => total + change, 0),
		),
		recent_elo_history_complete:
			recentEloChanges.length === recentMatches.length,
	};
}

export async function getCurrentSinglesLeaderboard(
	userId: string,
	limit: number,
) {
	const adminClient = createAdminClient();
	const ranking = await loadCurrentSinglesRanking(adminClient, userId);
	const players = ranking.rankedPlayers.slice(0, limit).map((player) => ({
		rank: player.rank,
		display_name: player.display_name,
		current_elo: player.current_elo,
		matches_played: player.matches_played,
		wins: player.wins,
		losses: player.losses,
		draws: player.draws,
		win_rate_percent: player.win_rate_percent,
		sets_won: player.sets_won,
		sets_lost: player.sets_lost,
		set_difference: player.set_difference,
	}));

	return {
		mode: "singles" as const,
		generated_at: new Date().toISOString(),
		rating_as_of: ranking.ratingAsOf,
		eligibility: ranking.eligibility,
		total_ranked_players: ranking.rankedPlayers.length,
		returned_players: players.length,
		players,
		authenticated_player: ranking.currentPlayer,
	};
}

function formatHeadToHeadResult(
	opponentMatches: ScopedSinglesMatch[],
	recentLimit: number,
) {
	return {
		mode: "singles" as const,
		opponent: opponentMatches[0].opponent,
		...summarizeScopedMatches(opponentMatches),
		recent_matches: opponentMatches.slice(0, recentLimit),
	};
}

export async function getOwnHeadToHead(
	userId: string,
	opponentId: string,
	recentLimit: number,
) {
	if (userId === opponentId) {
		throw new McpTableTennisError(
			"Choose a different opponent.",
			"INVALID_OPPONENT",
		);
	}

	const adminClient = createAdminClient();
	const rows = await loadHeadToHeadRows(adminClient, userId, opponentId);

	// Do not look up or expose an arbitrary profile. An opponent becomes visible
	// only after a completed singles match with the authenticated user is found.
	if (rows.length === 0) {
		throw new McpTableTennisError(
			"No completed singles matches were found with that opponent.",
			"NOT_FOUND",
		);
	}

	const matches = await formatMatchesForUser(adminClient, userId, rows);
	const opponentMatches = matches.filter(
		(match) => match.opponent.id === opponentId,
	);

	if (opponentMatches.length === 0) {
		throw new McpTableTennisError(
			"No completed singles matches were found with that opponent.",
			"NOT_FOUND",
		);
	}

	return formatHeadToHeadResult(opponentMatches, recentLimit);
}

export async function getOwnHeadToHeadByName(
	userId: string,
	opponentName: string,
	recentLimit: number,
) {
	const adminClient = createAdminClient();
	const rows = await loadOwnMatchHistoryRows(adminClient, userId);
	const matches = await formatMatchesForUser(adminClient, userId, rows);
	const resolution = resolveOpponentMatchesByName(matches, opponentName);

	// Name resolution is intentionally limited to profiles reached through the
	// authenticated player's own completed singles matches.
	if (resolution.status === "not_found") {
		throw new McpTableTennisError(
			`No completed singles matches were found against an opponent matching "${opponentName}".`,
			"NOT_FOUND",
		);
	}

	if (resolution.status === "ambiguous") {
		const names = resolution.candidates
			.map((candidate) => candidate.display_name)
			.join(", ");
		throw new McpTableTennisError(
			`More than one opponent matches "${opponentName}": ${names}. Ask again using the full name.`,
			"AMBIGUOUS_OPPONENT",
		);
	}

	return formatHeadToHeadResult(resolution.matches, recentLimit);
}

export async function getGeneralSinglesStatistics(options: {
	days: number;
	sortBy: GeneralStatisticsSort;
	minimumMatches: number;
	limit: number;
}) {
	const adminClient = createAdminClient();
	const periodEnd = new Date();
	const periodStart = new Date(
		periodEnd.getTime() - options.days * 24 * 60 * 60 * 1000,
	);
	const rows = await loadPeriodMatchRows(
		adminClient,
		periodStart.toISOString(),
		periodEnd.toISOString(),
	);
	const matches = rows
		.map(normalizeDatabaseMatch)
		.filter((match): match is SinglesMatchRecord => match !== null);
	const playerIds = Array.from(
		new Set(matches.flatMap((match) => match.player_ids)),
	);
	const matchIds = matches
		.map((match) => match.id)
		.filter((matchId): matchId is string => Boolean(matchId));
	const [profiles, historyRows] = await Promise.all([
		getProfilesMap(adminClient, playerIds),
		loadEloHistoryRows(adminClient, matchIds),
	]);
	const eloChanges = summarizePeriodEloChanges(historyRows);
	const aggregate = aggregateGeneralSinglesStatistics({
		matches,
		profiles,
		eloChanges,
		sortBy: options.sortBy,
		minimumMatches: options.minimumMatches,
		limit: options.limit,
	});

	return {
		mode: "singles" as const,
		period: {
			type: "rolling_days" as const,
			days: options.days,
			from: periodStart.toISOString(),
			to: periodEnd.toISOString(),
		},
		sort_by: options.sortBy,
		minimum_matches: options.minimumMatches,
		returned_players: aggregate.players.length,
		...aggregate,
	};
}

export async function getOwnEloTrend(
	userId: string,
	options: { days: number; limit: number },
) {
	const adminClient = createAdminClient();
	const periodEnd = new Date();
	const periodStart = new Date(
		periodEnd.getTime() - options.days * 24 * 60 * 60 * 1000,
	);
	const [rows, profileResult, ratingResult] = await Promise.all([
		loadOwnPeriodMatchRows(
			adminClient,
			userId,
			periodStart.toISOString(),
			periodEnd.toISOString(),
		),
		adminClient
			.from("profiles")
			.select("id, display_name")
			.eq("id", userId)
			.maybeSingle(),
		adminClient
			.from("player_ratings")
			.select("elo")
			.eq("player_id", userId)
			.maybeSingle(),
	]);

	if (profileResult.error || ratingResult.error) {
		throw new McpTableTennisError(
			"Personal Elo trend is temporarily unavailable.",
		);
	}

	const matches = await formatMatchesForUser(adminClient, userId, rows);
	const changes = matches
		.map((match) => match.elo_change)
		.filter((change): change is number => change !== null);
	const eloValues = matches.flatMap((match) =>
		[match.elo_before, match.elo_after].filter(
			(value): value is number => value !== null,
		),
	);
	const earliestMatch = matches[matches.length - 1];
	const latestMatch = matches[0];
	const profile = profileResult.data as ProfileRecord | null;
	const rating = ratingResult.data as { elo: number | string | null } | null;

	return {
		mode: "singles" as const,
		player: {
			display_name: profile?.display_name || "Unknown player",
		},
		period: {
			type: "rolling_days" as const,
			days: options.days,
			from: periodStart.toISOString(),
			to: periodEnd.toISOString(),
		},
		current_elo: roundToTwo(ratingValue(rating?.elo, 1500)),
		starting_elo: earliestMatch?.elo_before ?? null,
		ending_elo: latestMatch?.elo_after ?? null,
		net_elo_change: roundToTwo(
			changes.reduce((total, change) => total + change, 0),
		),
		elo_points_gained: roundToTwo(
			changes
				.filter((change) => change > 0)
				.reduce((total, change) => total + change, 0),
		),
		elo_points_lost: roundToTwo(
			changes
				.filter((change) => change < 0)
				.reduce((total, change) => total + Math.abs(change), 0),
		),
		period_high_elo: eloValues.length > 0 ? Math.max(...eloValues) : null,
		period_low_elo: eloValues.length > 0 ? Math.min(...eloValues) : null,
		total_matches: matches.length,
		elo_matches_counted: changes.length,
		elo_history_complete: changes.length === matches.length,
		returned_matches: Math.min(matches.length, options.limit),
		matches: matches.slice(0, options.limit),
	};
}

export async function getOwnRivalries(
	userId: string,
	options: { sortBy: RivalrySort; limit: number },
) {
	const adminClient = createAdminClient();
	const rows = await loadOwnMatchHistoryRows(adminClient, userId);
	const matches = await formatMatchesForUser(adminClient, userId, rows);
	const aggregate = aggregateRivalries({
		matches,
		sortBy: options.sortBy,
		limit: options.limit,
	});

	return {
		mode: "singles" as const,
		sort_by: options.sortBy,
		returned_rivalries: aggregate.rivalries.length,
		...aggregate,
	};
}

export function getSinglesEloRules() {
	return {
		mode: "singles" as const,
		starting_elo: 1500,
		formula: {
			expected_score:
				"1 / (1 + 10 ^ ((opponent Elo - player Elo) / 400))",
			new_elo:
				"current Elo + K-factor * (actual score - expected score)",
		},
		actual_scores: {
			win: 1,
			draw: 0.5,
			loss: 0,
		},
		k_factor_by_matches_before_match: [
			{ match_count: "0-9", k_factor: 40 },
			{ match_count: "10-39", k_factor: 32 },
			{ match_count: "40+", k_factor: 24 },
		],
		ranking_eligibility: {
			minimum_matches: MIN_SINGLES_MATCHES,
			maximum_inactivity_days: MAX_SINGLES_INACTIVITY_DAYS,
			note: "Ranking eligibility does not change the Elo formula.",
		},
		precision:
			"Calculations and stored ratings preserve decimal precision; screens may round for display.",
	};
}

function opposingResult(result: MatchResult): MatchResult {
	return result === "win" ? "loss" : result === "loss" ? "win" : "draw";
}

export async function getOwnEloProjection(
	userId: string,
	opponentName: string,
) {
	const adminClient = createAdminClient();
	const rows = await loadOwnMatchHistoryRows(adminClient, userId);
	const matches = await formatMatchesForUser(adminClient, userId, rows);
	const resolution = resolveOpponentMatchesByName(matches, opponentName);

	if (resolution.status === "not_found") {
		throw new McpTableTennisError(
			`No completed singles matches were found against an opponent matching "${opponentName}".`,
			"NOT_FOUND",
		);
	}

	if (resolution.status === "ambiguous") {
		const names = resolution.candidates
			.map((candidate) => candidate.display_name)
			.join(", ");
		throw new McpTableTennisError(
			`More than one opponent matches "${opponentName}": ${names}. Ask again using the full name.`,
			"AMBIGUOUS_OPPONENT",
		);
	}

	const opponentId = resolution.opponentId;
	const [ratingsResult, ownProfileResult] = await Promise.all([
		adminClient
			.from("player_ratings")
			.select("player_id, elo, matches_played")
			.in("player_id", [userId, opponentId]),
		adminClient
			.from("profiles")
			.select("id, display_name")
			.eq("id", userId)
			.maybeSingle(),
	]);

	if (ratingsResult.error || ownProfileResult.error) {
		throw new McpTableTennisError(
			"Elo projection is temporarily unavailable.",
		);
	}

	const ratings = (ratingsResult.data || []) as Array<
		Pick<RatingRecord, "player_id" | "elo" | "matches_played">
	>;
	const ownRating = ratings.find((rating) => rating.player_id === userId);
	const opponentRating = ratings.find(
		(rating) => rating.player_id === opponentId,
	);
	const playerElo = ratingValue(ownRating?.elo, 1500);
	const opponentElo = ratingValue(opponentRating?.elo, 1500);
	const playerMatchCount = ownRating?.matches_played ?? 0;
	const opponentMatchCount = opponentRating?.matches_played ?? 0;
	const ownProfile = ownProfileResult.data as ProfileRecord | null;
	const opponentDisplayName =
		resolution.matches[0]?.opponent.display_name || "Unknown player";

	const outcomes = (["win", "draw", "loss"] as MatchResult[]).map(
		(result) => {
			const opponentResult = opposingResult(result);
			const playerDelta = calculateEloDelta(
				playerElo,
				opponentElo,
				result,
				playerMatchCount,
			);
			const opponentDelta = calculateEloDelta(
				opponentElo,
				playerElo,
				opponentResult,
				opponentMatchCount,
			);
			const projectedElo = playerElo + playerDelta;
			const opponentProjectedElo = opponentElo + opponentDelta;

			return {
				result,
				expected_score: roundToTwo(
					calculateExpectedScore(playerElo, opponentElo),
				),
				elo_change: roundToTwo(playerDelta),
				projected_elo: roundToTwo(projectedElo),
				opponent_elo_change: roundToTwo(opponentDelta),
				opponent_projected_elo: roundToTwo(opponentProjectedElo),
				would_overtake_opponent: projectedElo > opponentProjectedElo,
			};
		},
	);

	return {
		mode: "singles" as const,
		player: {
			display_name: ownProfile?.display_name || "Unknown player",
			current_elo: roundToTwo(playerElo),
			matches_played: playerMatchCount,
			k_factor: calculateKFactor(playerMatchCount),
		},
		opponent: {
			display_name: opponentDisplayName,
			current_elo: roundToTwo(opponentElo),
			matches_played: opponentMatchCount,
			k_factor: calculateKFactor(opponentMatchCount),
		},
		outcomes,
		note:
			"Projection uses current ratings and match counts. The real result can differ if either changes before the match.",
	};
}
