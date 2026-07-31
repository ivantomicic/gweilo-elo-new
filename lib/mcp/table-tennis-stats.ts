export type MatchOutcome = "win" | "loss" | "draw";

export type ScopedSinglesMatch = {
	played_at: string | null;
	opponent: {
		id: string;
		display_name: string;
	};
	result: MatchOutcome;
	sets_for: number;
	sets_against: number;
};

export type SinglesMatchRecord = {
	id?: string;
	player_ids: string[];
	team1_score: number;
	team2_score: number;
	created_at: string | null;
};

export type OpponentNameResolution =
	| {
			status: "matched";
			opponentId: string;
			matches: ScopedSinglesMatch[];
	  }
	| {
			status: "ambiguous";
			candidates: Array<{
				id: string;
				display_name: string;
			}>;
	  }
	| {
			status: "not_found";
	  };

export type GeneralStatisticsSort =
	| "win_rate"
	| "wins"
	| "draws"
	| "losses"
	| "matches_played"
	| "sets_won"
	| "sets_lost"
	| "set_difference"
	| "elo_points_gained"
	| "elo_points_lost"
	| "net_elo_change";

export type PeriodEloChange = {
	eloPointsGained: number;
	eloPointsLost: number;
	netEloChange: number;
	matchIds: ReadonlySet<string>;
};

type PeriodMatchStats = {
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
	sets_won: number;
	sets_lost: number;
	set_difference: number;
};

type PeriodPlayerStats = PeriodMatchStats & {
	display_name: string;
	win_rate_percent: number;
	elo_points_gained: number;
	elo_points_lost: number;
	net_elo_change: number;
	elo_matches_counted: number;
	elo_history_complete: boolean;
};

export function serializeJsonbPlayerIdsContainment(playerIds: string[]) {
	return JSON.stringify(playerIds);
}

function normalizeOpponentName(value: string) {
	return value
		.normalize("NFKD")
		.replace(/\p{Diacritic}/gu, "")
		.trim()
		.toLocaleLowerCase("en-US")
		.replace(/\s+/g, " ");
}

function isNameAtWordBoundary(displayName: string, query: string) {
	return (
		displayName.startsWith(`${query} `) ||
		displayName.endsWith(` ${query}`) ||
		displayName.includes(` ${query} `)
	);
}

export function resolveOpponentMatchesByName(
	matches: ScopedSinglesMatch[],
	opponentName: string,
): OpponentNameResolution {
	const query = normalizeOpponentName(opponentName);
	if (!query) {
		return { status: "not_found" };
	}

	const opponents = Array.from(
		new Map(
			matches.map((match) => [
				match.opponent.id,
				{
					id: match.opponent.id,
					display_name: match.opponent.display_name,
					normalizedName: normalizeOpponentName(
						match.opponent.display_name,
					),
				},
			]),
		).values(),
	);
	const exactMatches = opponents.filter(
		(opponent) => opponent.normalizedName === query,
	);
	const candidates =
		exactMatches.length > 0
			? exactMatches
			: opponents.filter((opponent) =>
					isNameAtWordBoundary(opponent.normalizedName, query),
				);

	if (candidates.length === 0) {
		return { status: "not_found" };
	}

	if (candidates.length > 1) {
		return {
			status: "ambiguous",
			candidates: candidates.map(({ id, display_name }) => ({
				id,
				display_name,
			})),
		};
	}

	const opponentId = candidates[0].id;
	return {
		status: "matched",
		opponentId,
		matches: matches.filter(
			(match) => match.opponent.id === opponentId,
		),
	};
}

export function toScopedSinglesMatch(
	match: SinglesMatchRecord,
	userId: string,
	opponentName: string,
): ScopedSinglesMatch | null {
	if (match.player_ids.length !== 2) {
		return null;
	}

	const playerIndex = match.player_ids.indexOf(userId);
	if (playerIndex === -1) {
		return null;
	}

	const opponentIndex = playerIndex === 0 ? 1 : 0;
	const setsFor =
		playerIndex === 0 ? match.team1_score : match.team2_score;
	const setsAgainst =
		playerIndex === 0 ? match.team2_score : match.team1_score;

	return {
		played_at: match.created_at,
		opponent: {
			id: match.player_ids[opponentIndex],
			display_name: opponentName,
		},
		result:
			setsFor > setsAgainst
				? "win"
				: setsFor < setsAgainst
					? "loss"
					: "draw",
		sets_for: setsFor,
		sets_against: setsAgainst,
	};
}

export function summarizeScopedMatches(matches: ScopedSinglesMatch[]) {
	const wins = matches.filter((match) => match.result === "win").length;
	const losses = matches.filter((match) => match.result === "loss").length;
	const draws = matches.length - wins - losses;
	const setsWon = matches.reduce(
		(total, match) => total + match.sets_for,
		0,
	);
	const setsLost = matches.reduce(
		(total, match) => total + match.sets_against,
		0,
	);

	return {
		total_matches: matches.length,
		wins,
		losses,
		draws,
		win_rate_percent:
			matches.length > 0
				? Math.round((wins / matches.length) * 1000) / 10
				: 0,
		sets_won: setsWon,
		sets_lost: setsLost,
		set_difference: setsWon - setsLost,
	};
}

function comparePeriodStats(
	left: PeriodPlayerStats,
	right: PeriodPlayerStats,
	sortBy: GeneralStatisticsSort,
) {
	const metricDifference =
		sortBy === "win_rate"
			? right.win_rate_percent - left.win_rate_percent
			: right[sortBy] - left[sortBy];

	return (
		metricDifference ||
		right.wins - left.wins ||
		right.win_rate_percent - left.win_rate_percent ||
		right.set_difference - left.set_difference ||
		right.matches_played - left.matches_played ||
		left.display_name.localeCompare(right.display_name)
	);
}

export function aggregateGeneralSinglesStatistics(options: {
	matches: SinglesMatchRecord[];
	profiles: ReadonlyMap<string, string>;
	eloChanges: ReadonlyMap<string, PeriodEloChange>;
	sortBy: GeneralStatisticsSort;
	minimumMatches: number;
	limit: number;
}) {
	const statsByPlayer = new Map<string, PeriodMatchStats>();

	for (const match of options.matches) {
		if (match.player_ids.length !== 2) continue;

		for (const playerIndex of [0, 1]) {
			const playerId = match.player_ids[playerIndex];
			const setsFor =
				playerIndex === 0 ? match.team1_score : match.team2_score;
			const setsAgainst =
				playerIndex === 0 ? match.team2_score : match.team1_score;
			const stats = statsByPlayer.get(playerId) || {
				matches_played: 0,
				wins: 0,
				losses: 0,
				draws: 0,
				sets_won: 0,
				sets_lost: 0,
				set_difference: 0,
			};

			stats.matches_played += 1;
			stats.sets_won += setsFor;
			stats.sets_lost += setsAgainst;
			stats.set_difference = stats.sets_won - stats.sets_lost;
			if (setsFor > setsAgainst) stats.wins += 1;
			else if (setsFor < setsAgainst) stats.losses += 1;
			else stats.draws += 1;
			statsByPlayer.set(playerId, stats);
		}
	}

	const eligiblePlayers = Array.from(statsByPlayer.entries())
		.filter(([, stats]) => stats.matches_played >= options.minimumMatches)
		.map(([playerId, stats]): PeriodPlayerStats => ({
			display_name: options.profiles.get(playerId) || "Unknown player",
			...stats,
			win_rate_percent:
				stats.matches_played > 0
					? Math.round(
							(stats.wins / stats.matches_played) * 1000,
						) / 10
					: 0,
			elo_points_gained:
				options.eloChanges.get(playerId)?.eloPointsGained ?? 0,
			elo_points_lost:
				options.eloChanges.get(playerId)?.eloPointsLost ?? 0,
			net_elo_change:
				options.eloChanges.get(playerId)?.netEloChange ?? 0,
			elo_matches_counted:
				options.eloChanges.get(playerId)?.matchIds.size ?? 0,
			elo_history_complete:
				(options.eloChanges.get(playerId)?.matchIds.size ?? 0) ===
				stats.matches_played,
		}))
		.sort((left, right) =>
			comparePeriodStats(left, right, options.sortBy),
		);

	return {
		total_eligible_players: eligiblePlayers.length,
		players: eligiblePlayers
			.slice(0, options.limit)
			.map((player, index) => ({ rank: index + 1, ...player })),
	};
}
