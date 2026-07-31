import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
	serializeJsonbPlayerIdsContainment,
	resolveOpponentMatchesByName,
	summarizeScopedMatches,
	toScopedSinglesMatch,
	type ScopedSinglesMatch,
	type SinglesMatchRecord,
} from "@/lib/mcp/table-tennis-stats";

const MATCH_PAGE_SIZE = 500;
const MAX_HEAD_TO_HEAD_MATCHES = 5000;

type ProfileRecord = {
	id: string;
	display_name: string | null;
};

type RatingRecord = {
	matches_played: number | null;
	wins: number | null;
	losses: number | null;
	draws: number | null;
};

type DatabaseMatchRecord = {
	player_ids: unknown;
	team1_score: number | string | null;
	team2_score: number | string | null;
	created_at: string | null;
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

async function loadRecentMatchRows(
	adminClient: SupabaseClient,
	userId: string,
	limit: number,
) {
	const { data, error } = await adminClient
		.from("session_matches")
		.select("player_ids, team1_score, team2_score, created_at")
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
			.select("player_ids, team1_score, team2_score, created_at")
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
			.select("player_ids, team1_score, team2_score, created_at")
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
	const profiles = await getProfilesMap(adminClient, opponentIds);

	return normalized
		.map((match) => {
			const opponentId =
				match.player_ids.find((id) => id !== userId) || "";
			return toScopedSinglesMatch(
				match,
				userId,
				profiles.get(opponentId) || "Unknown player",
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
	const [profileResult, ratingResult, recentRows] = await Promise.all([
		adminClient
			.from("profiles")
			.select("id, display_name")
			.eq("id", userId)
			.maybeSingle(),
		adminClient
			.from("player_ratings")
			.select("matches_played, wins, losses, draws")
			.eq("player_id", userId)
			.maybeSingle(),
		loadRecentMatchRows(adminClient, userId, recentLimit),
	]);

	if (profileResult.error || ratingResult.error) {
		throw new McpTableTennisError(
			"Player performance is temporarily unavailable.",
		);
	}

	const recentMatches = await formatMatchesForUser(
		adminClient,
		userId,
		recentRows,
	);
	const profile = profileResult.data as ProfileRecord | null;
	const rating = ratingResult.data as RatingRecord | null;
	const matchesPlayed = rating?.matches_played ?? 0;
	const wins = rating?.wins ?? 0;
	const losses = rating?.losses ?? 0;
	const draws = rating?.draws ?? 0;

	return {
		mode: "singles" as const,
		player: {
			display_name: profile?.display_name || "Unknown player",
		},
		matches_played: matchesPlayed,
		wins,
		losses,
		draws,
		win_rate_percent:
			matchesPlayed > 0
				? Math.round((wins / matchesPlayed) * 1000) / 10
				: 0,
		recent_form: recentMatches.map((match) => match.result),
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
