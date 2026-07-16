import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
	MIN_DOUBLES_PLAYER_MATCHES,
	MIN_SINGLES_MATCHES,
} from "@/lib/statistics/min-matches";

export type RatingMode = "singles" | "doubles";

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

type MatchHistoryRecord = {
	match_id: string;
	created_at: string | null;
};

type MatchRecord = {
	id: string;
	match_type: string;
	status: string;
	player_ids: string[] | null;
	team1_score: number | null;
	team2_score: number | null;
	created_at: string | null;
};

export class GptStatsError extends Error {
	status: number;
	details?: unknown;

	constructor(message: string, status = 500, details?: unknown) {
		super(message);
		this.name = "GptStatsError";
		this.status = status;
		this.details = details;
	}
}

function toNumber(value: unknown, fallback = 0) {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	}

	return fallback;
}

function percentage(numerator: number, denominator: number) {
	return denominator > 0
		? Math.round((numerator / denominator) * 1000) / 10
		: 0;
}

function ratingTable(mode: RatingMode) {
	return mode === "singles" ? "player_ratings" : "player_double_ratings";
}

function defaultMinimumMatches(mode: RatingMode) {
	return mode === "singles"
		? MIN_SINGLES_MATCHES
		: MIN_DOUBLES_PLAYER_MATCHES;
}

function formatRating(
	rating: RatingRecord,
	profile: ProfileRecord | undefined,
	rank?: number,
) {
	const matchesPlayed = rating.matches_played ?? 0;
	const wins = rating.wins ?? 0;
	const losses = rating.losses ?? 0;
	const draws = rating.draws ?? 0;
	const setsWon = rating.sets_won ?? 0;
	const setsLost = rating.sets_lost ?? 0;

	return {
		...(rank ? { rank } : {}),
		display_name: profile?.display_name || "Unknown player",
		elo: Math.round(toNumber(rating.elo, 1500)),
		matches_played: matchesPlayed,
		wins,
		losses,
		draws,
		win_rate_percent: percentage(wins, matchesPlayed),
		sets_won: setsWon,
		sets_lost: setsLost,
		set_difference: setsWon - setsLost,
	};
}

async function getProfilesMap(
	adminClient: SupabaseClient,
	playerIds: string[],
) {
	if (playerIds.length === 0) {
		return new Map<string, ProfileRecord>();
	}

	const { data, error } = await adminClient
		.from("profiles")
		.select("id, display_name")
		.in("id", playerIds);

	if (error) {
		throw new GptStatsError("Failed to load player names.");
	}

	return new Map(
		((data || []) as ProfileRecord[]).map((profile) => [profile.id, profile]),
	);
}

function normalizeName(value: string) {
	return value.trim().toLocaleLowerCase();
}

export async function resolvePlayerByName(
	adminClient: SupabaseClient,
	name: string,
) {
	const normalizedName = normalizeName(name);
	if (!normalizedName) {
		throw new GptStatsError("Player name is required.", 400);
	}

	const { data, error } = await adminClient
		.from("profiles")
		.select("id, display_name")
		.not("display_name", "is", null);

	if (error) {
		throw new GptStatsError("Failed to search players.");
	}

	const profiles = (data || []) as ProfileRecord[];
	const exactMatches = profiles.filter(
		(profile) => normalizeName(profile.display_name || "") === normalizedName,
	);
	const matches =
		exactMatches.length > 0
			? exactMatches
			: profiles.filter((profile) =>
					normalizeName(profile.display_name || "").includes(normalizedName),
				);

	if (matches.length === 0) {
		throw new GptStatsError(`No player found for "${name}".`, 404);
	}

	if (matches.length > 1) {
		throw new GptStatsError(
			`More than one player matches "${name}". Use a more specific name.`,
			409,
			{
				matches: matches
					.slice(0, 10)
					.map((profile) => profile.display_name),
			},
		);
	}

	return matches[0];
}

export async function getLeaderboard(options: {
	mode: RatingMode;
	limit: number;
	minimumMatches?: number;
}) {
	const adminClient = createAdminClient();
	const minimumMatches =
		options.minimumMatches ?? defaultMinimumMatches(options.mode);
	const { data, error } = await adminClient
		.from(ratingTable(options.mode))
		.select(
			"player_id, matches_played, wins, losses, draws, sets_won, sets_lost, elo",
		)
		.gte("matches_played", minimumMatches)
		.order("elo", { ascending: false })
		.limit(options.limit);

	if (error) {
		throw new GptStatsError("Failed to load the leaderboard.");
	}

	const ratings = (data || []) as RatingRecord[];
	const profiles = await getProfilesMap(
		adminClient,
		ratings.map((rating) => rating.player_id),
	);

	return {
		mode: options.mode,
		minimum_matches: minimumMatches,
		players: ratings.map((rating, index) =>
			formatRating(rating, profiles.get(rating.player_id), index + 1),
		),
	};
}

export async function getPlayerSummary(name: string) {
	const adminClient = createAdminClient();
	const player = await resolvePlayerByName(adminClient, name);
	const [singlesResult, doublesResult] = await Promise.all([
		adminClient
			.from("player_ratings")
			.select(
				"player_id, matches_played, wins, losses, draws, sets_won, sets_lost, elo",
			)
			.eq("player_id", player.id)
			.maybeSingle(),
		adminClient
			.from("player_double_ratings")
			.select(
				"player_id, matches_played, wins, losses, draws, sets_won, sets_lost, elo",
			)
			.eq("player_id", player.id)
			.maybeSingle(),
	]);

	if (singlesResult.error || doublesResult.error) {
		throw new GptStatsError("Failed to load the player summary.");
	}

	return {
		display_name: player.display_name || "Unknown player",
		singles: singlesResult.data
			? formatRating(singlesResult.data as RatingRecord, player)
			: null,
		doubles: doublesResult.data
			? formatRating(doublesResult.data as RatingRecord, player)
			: null,
	};
}

export async function getHeadToHead(playerName: string, opponentName: string) {
	const adminClient = createAdminClient();
	const [player, opponent] = await Promise.all([
		resolvePlayerByName(adminClient, playerName),
		resolvePlayerByName(adminClient, opponentName),
	]);

	if (player.id === opponent.id) {
		throw new GptStatsError("Choose two different players.", 400);
	}

	const { data: historyData, error: historyError } = await adminClient
		.from("match_elo_history")
		.select("match_id, created_at")
		.or(
			`and(player1_id.eq.${player.id},player2_id.eq.${opponent.id}),and(player1_id.eq.${opponent.id},player2_id.eq.${player.id})`,
		)
		.order("created_at", { ascending: false });

	if (historyError) {
		throw new GptStatsError("Failed to load head-to-head history.");
	}

	const history = (historyData || []) as MatchHistoryRecord[];
	const matchIds = Array.from(
		new Set(history.map((entry) => entry.match_id).filter(Boolean)),
	);
	const { data: matchData, error: matchError } =
		matchIds.length > 0
			? await adminClient
					.from("session_matches")
					.select(
						"id, match_type, status, player_ids, team1_score, team2_score, created_at",
					)
					.in("id", matchIds)
			: { data: [] as MatchRecord[], error: null };

	if (matchError) {
		throw new GptStatsError("Failed to load head-to-head matches.");
	}

	const historyDateByMatchId = new Map(
		history.map((entry) => [entry.match_id, entry.created_at]),
	);
	const matches = ((matchData || []) as MatchRecord[])
		.filter(
			(match) =>
				match.match_type === "singles" &&
				match.status === "completed" &&
				match.player_ids?.includes(player.id) &&
				match.player_ids?.includes(opponent.id) &&
				match.team1_score !== null &&
				match.team2_score !== null,
		)
		.map((match) => {
			const playerIsTeamOne = match.player_ids?.[0] === player.id;
			const playerScore = playerIsTeamOne
				? match.team1_score!
				: match.team2_score!;
			const opponentScore = playerIsTeamOne
				? match.team2_score!
				: match.team1_score!;
			const result =
				playerScore > opponentScore
					? "win"
					: playerScore < opponentScore
						? "loss"
						: "draw";

			return {
				played_at:
					historyDateByMatchId.get(match.id) || match.created_at || null,
				result,
				player_sets: playerScore,
				opponent_sets: opponentScore,
			};
		})
		.sort((a, b) =>
			(b.played_at || "").localeCompare(a.played_at || ""),
		);

	const wins = matches.filter((match) => match.result === "win").length;
	const losses = matches.filter((match) => match.result === "loss").length;
	const draws = matches.filter((match) => match.result === "draw").length;
	const playerSets = matches.reduce(
		(total, match) => total + match.player_sets,
		0,
	);
	const opponentSets = matches.reduce(
		(total, match) => total + match.opponent_sets,
		0,
	);

	return {
		player: {
			display_name: player.display_name,
		},
		opponent: {
			display_name: opponent.display_name,
		},
		total_matches: matches.length,
		wins,
		losses,
		draws,
		win_rate_percent: percentage(wins, matches.length),
		sets_won: playerSets,
		sets_lost: opponentSets,
		set_difference: playerSets - opponentSets,
		recent_matches: matches.slice(0, 10),
	};
}
