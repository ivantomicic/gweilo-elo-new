import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
	calculateEloDelta,
	calculateExpectedScore,
	calculateKFactor,
	getActualScore,
	type MatchResult,
} from "@/lib/elo/calculation";
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

type DetailedMatchHistoryRecord = MatchHistoryRecord & {
	player1_id: string;
	player2_id: string;
	player1_elo_after: number | string | null;
	player2_elo_after: number | string | null;
	player1_elo_delta: number | string | null;
	player2_elo_delta: number | string | null;
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

function roundToTwo(value: number) {
	return Math.round((value + Number.EPSILON) * 100) / 100;
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

async function getSinglesRatingSnapshot(
	adminClient: SupabaseClient,
	player: ProfileRecord,
) {
	const { data, error } = await adminClient
		.from("player_ratings")
		.select(
			"player_id, matches_played, wins, losses, draws, sets_won, sets_lost, elo",
		)
		.eq("player_id", player.id)
		.maybeSingle();

	if (error) {
		throw new GptStatsError("Failed to load the player's singles rating.");
	}

	const rating = data as RatingRecord | null;
	const wins = rating?.wins ?? 0;
	const losses = rating?.losses ?? 0;
	const draws = rating?.draws ?? 0;
	const matchCount = wins + losses + draws;

	return {
		playerId: player.id,
		displayName: player.display_name || "Unknown player",
		elo: toNumber(rating?.elo, 1500),
		matchCount,
		kFactor: calculateKFactor(matchCount),
	};
}

export function getEloRules() {
	return {
		system: "Gweilo Elo",
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
		singles:
			"Uses each player's current singles Elo and that player's own K-factor.",
		doubles_player_rating:
			"Uses each team's average individual doubles Elo. Both partners receive the same player-doubles delta, calculated using the team's average doubles match count.",
		doubles_team_rating:
			"A separate rating for the exact pair, calculated from that pair's team Elo against the opposing pair's team Elo.",
		precision:
			"Calculations and stored ratings preserve decimal precision; screens may round values for display.",
		ranking_eligibility: {
			singles_minimum_matches: MIN_SINGLES_MATCHES,
			doubles_player_minimum_matches: MIN_DOUBLES_PLAYER_MATCHES,
			note: "Minimum-match thresholds affect ranked leaderboard eligibility, not the Elo formula.",
		},
	};
}

function getMinimumOpponentRequirement(options: {
	playerElo: number;
	matchCount: number;
	targetElo: number;
	result: MatchResult;
}) {
	const requiredGain = options.targetElo - options.playerElo;
	const kFactor = calculateKFactor(options.matchCount);
	const actualScore = getActualScore(options.result);

	if (requiredGain <= 0) {
		return {
			result: options.result,
			possible: true,
			note: "The player is already at or above the target. Specify an opponent to check whether this result would keep them there.",
		};
	}

	const maximumGain = kFactor * actualScore;
	if (maximumGain <= 0 || requiredGain >= maximumGain) {
		return {
			result: options.result,
			possible: false,
			maximum_theoretical_gain: roundToTwo(maximumGain),
			note: `This result cannot add the required ${roundToTwo(requiredGain)} Elo in one match.`,
		};
	}

	const requiredMaximumExpectedScore = actualScore - requiredGain / kFactor;
	const theoreticalOpponentElo =
		options.playerElo +
		400 * Math.log10(1 / requiredMaximumExpectedScore - 1);
	const minimumOpponentElo = Math.ceil(theoreticalOpponentElo * 100) / 100;
	const projectedDelta = calculateEloDelta(
		options.playerElo,
		minimumOpponentElo,
		options.result,
		options.matchCount,
	);

	return {
		result: options.result,
		possible: true,
		minimum_opponent_elo: minimumOpponentElo,
		projected_elo_change: roundToTwo(projectedDelta),
		projected_elo: roundToTwo(options.playerElo + projectedDelta),
		note: "The opponent must have at least this Elo immediately before the match.",
	};
}

export async function getSinglesEloScenario(options: {
	playerName: string;
	opponentName?: string;
	targetElo?: number;
	targetPlayerName?: string;
}) {
	const adminClient = createAdminClient();
	const player = await resolvePlayerByName(adminClient, options.playerName);
	const playerRating = await getSinglesRatingSnapshot(adminClient, player);
	const targetElo = options.targetElo;

	let opponentRating: Awaited<ReturnType<typeof getSinglesRatingSnapshot>> | null =
		null;
	if (options.opponentName) {
		const opponent = await resolvePlayerByName(
			adminClient,
			options.opponentName,
		);
		if (opponent.id === player.id) {
			throw new GptStatsError("Choose two different players.", 400);
		}
		opponentRating = await getSinglesRatingSnapshot(adminClient, opponent);
	}

	let targetPlayerRating: Awaited<
		ReturnType<typeof getSinglesRatingSnapshot>
	> | null = null;
	if (options.targetPlayerName) {
		const targetPlayer = await resolvePlayerByName(
			adminClient,
			options.targetPlayerName,
		);
		if (targetPlayer.id === player.id) {
			throw new GptStatsError(
				"The target player must be different from the player being projected.",
				400,
			);
		}
		targetPlayerRating = await getSinglesRatingSnapshot(
			adminClient,
			targetPlayer,
		);
	}

	const effectiveTargetElo =
		targetElo ??
		(targetPlayerRating ? targetPlayerRating.elo + 0.01 : undefined);
	const selectedOpponent = opponentRating;

	const outcomes = selectedOpponent
		? (["win", "draw", "loss"] as MatchResult[]).map((result) => {
				const opponentResult: MatchResult =
					result === "win" ? "loss" : result === "loss" ? "win" : "draw";
				const expectedScore = calculateExpectedScore(
					playerRating.elo,
					selectedOpponent.elo,
				);
				const delta = calculateEloDelta(
					playerRating.elo,
					selectedOpponent.elo,
					result,
					playerRating.matchCount,
				);
				const opponentDelta = calculateEloDelta(
					selectedOpponent.elo,
					playerRating.elo,
					opponentResult,
					selectedOpponent.matchCount,
				);
				const projectedElo = playerRating.elo + delta;
				const opponentProjectedElo = selectedOpponent.elo + opponentDelta;
				const targetPlayerProjectedElo =
					targetPlayerRating?.playerId === selectedOpponent.playerId
						? opponentProjectedElo
						: targetPlayerRating?.elo;

				return {
					result,
					expected_score: roundToTwo(expectedScore),
					elo_change: roundToTwo(delta),
					projected_elo: roundToTwo(projectedElo),
					opponent_elo_change: roundToTwo(opponentDelta),
					opponent_projected_elo: roundToTwo(opponentProjectedElo),
					...(options.targetElo !== undefined
						? { reaches_target_elo: projectedElo >= options.targetElo }
						: {}),
					...(targetPlayerProjectedElo !== undefined
						? {
								overtakes_target_player:
									projectedElo > targetPlayerProjectedElo,
								target_player_projected_elo: roundToTwo(
									targetPlayerProjectedElo,
								),
							}
						: {}),
				};
			})
		: [];

	return {
		mode: "singles",
		player: {
			display_name: playerRating.displayName,
			current_elo: roundToTwo(playerRating.elo),
			matches_played: playerRating.matchCount,
			k_factor: playerRating.kFactor,
		},
		opponent: opponentRating
			? {
					display_name: opponentRating.displayName,
					current_elo: roundToTwo(opponentRating.elo),
					matches_played: opponentRating.matchCount,
				}
			: null,
		target_elo: options.targetElo ?? null,
		target_player: targetPlayerRating
			? {
					display_name: targetPlayerRating.displayName,
					current_elo: roundToTwo(targetPlayerRating.elo),
				}
			: null,
		required_gain:
			effectiveTargetElo !== undefined
				? roundToTwo(Math.max(0, effectiveTargetElo - playerRating.elo))
				: null,
		outcomes,
		minimum_opponent_requirements:
			effectiveTargetElo !== undefined && !opponentRating
				? (["win", "draw", "loss"] as MatchResult[]).map((result) =>
						getMinimumOpponentRequirement({
							playerElo: playerRating.elo,
							matchCount: playerRating.matchCount,
							targetElo: effectiveTargetElo,
							result,
						}),
					)
				: [],
		calculation_note:
			"This is a prediction using current ratings. The real result can differ if either player's Elo or match count changes before the match.",
	};
}

export async function getPlayerTrend(name: string, limit: number) {
	const adminClient = createAdminClient();
	const player = await resolvePlayerByName(adminClient, name);
	const { data: historyData, error: historyError } = await adminClient
		.from("match_elo_history")
		.select(
			"match_id, player1_id, player2_id, player1_elo_after, player2_elo_after, player1_elo_delta, player2_elo_delta, created_at",
		)
		.or(`player1_id.eq.${player.id},player2_id.eq.${player.id}`)
		.order("created_at", { ascending: true });

	if (historyError) {
		throw new GptStatsError("Failed to load player rating history.");
	}

	const history = (historyData || []) as DetailedMatchHistoryRecord[];
	const matchIds = Array.from(
		new Set(history.map((entry) => entry.match_id).filter(Boolean)),
	);
	const { data: matchData, error: matchError } =
		matchIds.length > 0
			? await adminClient
					.from("session_matches")
					.select("id, match_type, status")
					.in("id", matchIds)
			: {
					data: [] as Array<{
						id: string;
						match_type: string;
						status: string;
					}>,
					error: null,
				};

	if (matchError) {
		throw new GptStatsError("Failed to load rating-history matches.");
	}

	const singlesMatchIds = new Set(
		((matchData || []) as Array<{
			id: string;
			match_type: string;
			status: string;
		}>)
			.filter(
				(match) =>
					match.match_type === "singles" && match.status === "completed",
			)
			.map((match) => match.id),
	);
	const singlesHistory = history.filter((entry) =>
		singlesMatchIds.has(entry.match_id),
	);
	const opponentIds = Array.from(
		new Set(
			singlesHistory.map((entry) =>
				entry.player1_id === player.id
					? entry.player2_id
					: entry.player1_id,
			),
		),
	);
	const profiles = await getProfilesMap(adminClient, opponentIds);
	const points = singlesHistory.map((entry, index) => {
		const playerIsFirst = entry.player1_id === player.id;
		const opponentId = playerIsFirst ? entry.player2_id : entry.player1_id;
		const eloAfter = toNumber(
			playerIsFirst ? entry.player1_elo_after : entry.player2_elo_after,
			1500,
		);
		const eloChange = toNumber(
			playerIsFirst ? entry.player1_elo_delta : entry.player2_elo_delta,
		);

		return {
			match_number: index + 1,
			played_at: entry.created_at,
			opponent: profiles.get(opponentId)?.display_name || "Unknown player",
			result:
				eloChange > 0 ? "win" : eloChange < 0 ? "loss" : "draw",
			elo_after: Math.round(eloAfter),
			elo_change: Math.round(eloChange),
		};
	});
	const returnedPoints = points.slice(-limit);
	const firstReturned = returnedPoints[0];
	const lastReturned = returnedPoints[returnedPoints.length - 1];
	const startingElo = firstReturned
		? firstReturned.elo_after - firstReturned.elo_change
		: 1500;

	return {
		display_name: player.display_name || "Unknown player",
		mode: "singles",
		total_matches: points.length,
		returned_matches: returnedPoints.length,
		current_elo: lastReturned?.elo_after ?? 1500,
		elo_change_over_returned_matches: lastReturned
			? lastReturned.elo_after - startingElo
			: 0,
		career_high_elo:
			points.length > 0
				? Math.max(...points.map((point) => point.elo_after))
				: 1500,
		career_low_elo:
			points.length > 0
				? Math.min(...points.map((point) => point.elo_after))
				: 1500,
		matches: returnedPoints,
	};
}

export async function getPlayerRivalries(name: string, limit: number) {
	const adminClient = createAdminClient();
	const player = await resolvePlayerByName(adminClient, name);
	const { data: historyData, error: historyError } = await adminClient
		.from("match_elo_history")
		.select(
			"match_id, player1_id, player2_id, player1_elo_after, player2_elo_after, player1_elo_delta, player2_elo_delta, created_at",
		)
		.or(`player1_id.eq.${player.id},player2_id.eq.${player.id}`)
		.order("created_at", { ascending: false });

	if (historyError) {
		throw new GptStatsError("Failed to load player rivalries.");
	}

	const history = (historyData || []) as DetailedMatchHistoryRecord[];
	const matchIds = Array.from(
		new Set(history.map((entry) => entry.match_id).filter(Boolean)),
	);
	const { data: matchData, error: matchError } =
		matchIds.length > 0
			? await adminClient
					.from("session_matches")
					.select("id, match_type, status")
					.in("id", matchIds)
			: {
					data: [] as Array<{
						id: string;
						match_type: string;
						status: string;
					}>,
					error: null,
				};

	if (matchError) {
		throw new GptStatsError("Failed to load rivalry matches.");
	}

	const singlesMatchIds = new Set(
		((matchData || []) as Array<{
			id: string;
			match_type: string;
			status: string;
		}>)
			.filter(
				(match) =>
					match.match_type === "singles" && match.status === "completed",
			)
			.map((match) => match.id),
	);
	const rivalryMap = new Map<
		string,
		{
			wins: number;
			losses: number;
			draws: number;
			lastPlayedAt: string | null;
			recentResults: string[];
		}
	>();

	for (const entry of history) {
		if (!singlesMatchIds.has(entry.match_id)) continue;
		const playerIsFirst = entry.player1_id === player.id;
		const opponentId = playerIsFirst ? entry.player2_id : entry.player1_id;
		const eloChange = toNumber(
			playerIsFirst ? entry.player1_elo_delta : entry.player2_elo_delta,
		);
		const result = eloChange > 0 ? "win" : eloChange < 0 ? "loss" : "draw";
		const rivalry = rivalryMap.get(opponentId) || {
			wins: 0,
			losses: 0,
			draws: 0,
			lastPlayedAt: entry.created_at,
			recentResults: [],
		};

		if (result === "win") rivalry.wins += 1;
		else if (result === "loss") rivalry.losses += 1;
		else rivalry.draws += 1;
		rivalry.recentResults.push(result);
		rivalryMap.set(opponentId, rivalry);
	}

	const profiles = await getProfilesMap(
		adminClient,
		Array.from(rivalryMap.keys()),
	);
	const rivalries = Array.from(rivalryMap.entries())
		.map(([opponentId, rivalry]) => {
			const totalMatches = rivalry.wins + rivalry.losses + rivalry.draws;
			const latestResult = rivalry.recentResults[0] || null;
			let currentStreak = 0;
			for (const result of rivalry.recentResults) {
				if (result !== latestResult) break;
				currentStreak += 1;
			}

			return {
				opponent: profiles.get(opponentId)?.display_name || "Unknown player",
				total_matches: totalMatches,
				wins: rivalry.wins,
				losses: rivalry.losses,
				draws: rivalry.draws,
				win_rate_percent: percentage(rivalry.wins, totalMatches),
				last_played_at: rivalry.lastPlayedAt,
				current_streak:
					latestResult && currentStreak > 0
						? { result: latestResult, matches: currentStreak }
						: null,
			};
		})
		.sort(
			(a, b) =>
				b.total_matches - a.total_matches ||
				Math.abs(a.wins - a.losses) - Math.abs(b.wins - b.losses),
		)
		.slice(0, limit);

	return {
		display_name: player.display_name || "Unknown player",
		mode: "singles",
		rivalries,
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
