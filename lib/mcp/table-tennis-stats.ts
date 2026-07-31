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
	elo_before: number | null;
	elo_after: number | null;
	elo_change: number | null;
};

export type PlayerMatchElo = {
	before: number | null;
	after: number | null;
	change: number | null;
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

export type PlayerProfile = {
	id: string;
	display_name: string;
};

export type PlayerNameResolution =
	| { status: "matched"; player: PlayerProfile }
	| { status: "ambiguous"; candidates: PlayerProfile[] }
	| { status: "not_found" };

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

export type RivalrySort =
	| "total_matches"
	| "closest_record"
	| "elo_points_gained"
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

export function resolvePlayerProfilesByName(
	players: PlayerProfile[],
	playerName: string,
): PlayerNameResolution {
	const query = normalizeOpponentName(playerName);
	if (!query) return { status: "not_found" };

	const normalizedPlayers = players.map((player) => ({
		...player,
		normalizedName: normalizeOpponentName(player.display_name),
	}));
	const exactMatches = normalizedPlayers.filter(
		(player) => player.normalizedName === query,
	);
	const candidates =
		exactMatches.length > 0
			? exactMatches
			: normalizedPlayers.filter((player) =>
					isNameAtWordBoundary(player.normalizedName, query),
				);

	if (candidates.length === 0) return { status: "not_found" };
	if (candidates.length > 1) {
		return {
			status: "ambiguous",
			candidates: candidates.map(({ id, display_name }) => ({
				id,
				display_name,
			})),
		};
	}

	return {
		status: "matched",
		player: {
			id: candidates[0].id,
			display_name: candidates[0].display_name,
		},
	};
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
	elo: PlayerMatchElo = { before: null, after: null, change: null },
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
		elo_before: elo.before,
		elo_after: elo.after,
		elo_change: elo.change,
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

export function aggregateRivalries(options: {
	matches: ScopedSinglesMatch[];
	sortBy: RivalrySort;
	limit: number;
}) {
	const matchesByOpponent = new Map<string, ScopedSinglesMatch[]>();
	for (const match of options.matches) {
		const opponentMatches = matchesByOpponent.get(match.opponent.id) || [];
		opponentMatches.push(match);
		matchesByOpponent.set(match.opponent.id, opponentMatches);
	}

	const rivalries = Array.from(matchesByOpponent.values()).map((matches) => {
		const summary = summarizeScopedMatches(matches);
		const eloChanges = matches
			.map((match) => match.elo_change)
			.filter((change): change is number => change !== null);
		const latestResult = matches[0]?.result ?? null;
		let streakMatches = 0;
		for (const match of matches) {
			if (match.result !== latestResult) break;
			streakMatches += 1;
		}

		return {
			opponent: {
				display_name: matches[0].opponent.display_name,
			},
			...summary,
			elo_points_gained: Math.round(
				eloChanges
					.filter((change) => change > 0)
					.reduce((total, change) => total + change, 0) * 100,
			) / 100,
			elo_points_lost: Math.round(
				eloChanges
					.filter((change) => change < 0)
					.reduce((total, change) => total + Math.abs(change), 0) *
					100,
			) / 100,
			net_elo_change: Math.round(
				eloChanges.reduce((total, change) => total + change, 0) * 100,
			) / 100,
			elo_matches_counted: eloChanges.length,
			elo_history_complete: eloChanges.length === matches.length,
			last_played_at: matches[0]?.played_at ?? null,
			current_streak:
				latestResult && streakMatches > 0
					? { result: latestResult, matches: streakMatches }
					: null,
		};
	});

	rivalries.sort((left, right) => {
		if (options.sortBy === "closest_record") {
			return (
				Math.abs(left.wins - left.losses) -
					Math.abs(right.wins - right.losses) ||
				right.total_matches - left.total_matches ||
				left.opponent.display_name.localeCompare(
					right.opponent.display_name,
				)
			);
		}

		return (
			right[options.sortBy] - left[options.sortBy] ||
			right.total_matches - left.total_matches ||
			left.opponent.display_name.localeCompare(right.opponent.display_name)
		);
	});

	return {
		total_opponents: rivalries.length,
		rivalries: rivalries.slice(0, options.limit),
	};
}

export function buildPlayerOpponentBreakdown(
	matches: ScopedSinglesMatch[],
	limit: number,
) {
	const summary = summarizeScopedMatches(matches);
	const { rivalries, total_opponents: totalOpponents } = aggregateRivalries({
		matches,
		sortBy: "total_matches",
		limit: matches.length,
	});
	const opponents = rivalries.map((rivalry) => ({
		opponent: rivalry.opponent,
		matches_played: rivalry.total_matches,
		player_match_wins: rivalry.wins,
		opponent_match_wins: rivalry.losses,
		draws: rivalry.draws,
		player_win_rate_percent: rivalry.win_rate_percent,
		player_sets_won: rivalry.sets_won,
		opponent_sets_won: rivalry.sets_lost,
		set_difference: rivalry.set_difference,
		player_elo_change: rivalry.net_elo_change,
		elo_matches_counted: rivalry.elo_matches_counted,
		elo_history_complete: rivalry.elo_history_complete,
		last_played_at: rivalry.last_played_at,
	}));
	const byName = (
		left: (typeof opponents)[number],
		right: (typeof opponents)[number],
	) => left.opponent.display_name.localeCompare(right.opponent.display_name);

	return {
		player_totals: {
			matches_played: summary.total_matches,
			wins: summary.wins,
			losses: summary.losses,
			draws: summary.draws,
			win_rate_percent: summary.win_rate_percent,
			sets_won: summary.sets_won,
			sets_lost: summary.sets_lost,
			set_difference: summary.set_difference,
		},
		total_opponents: totalOpponents,
		returned_opponents: Math.min(opponents.length, limit),
		opponents: opponents.slice(0, limit),
		opponents_who_won_matches: opponents
			.filter((opponent) => opponent.opponent_match_wins > 0)
			.sort(
				(left, right) =>
					right.opponent_match_wins - left.opponent_match_wins ||
					right.opponent_sets_won - left.opponent_sets_won ||
					byName(left, right),
			)
			.slice(0, limit),
		opponents_who_won_sets: opponents
			.filter((opponent) => opponent.opponent_sets_won > 0)
			.sort(
				(left, right) =>
					right.opponent_sets_won - left.opponent_sets_won ||
					right.opponent_match_wins - left.opponent_match_wins ||
					byName(left, right),
			)
			.slice(0, limit),
	};
}
