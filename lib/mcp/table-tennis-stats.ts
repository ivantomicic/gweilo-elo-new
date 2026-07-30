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
	player_ids: string[];
	team1_score: number;
	team2_score: number;
	created_at: string | null;
};

export function serializeJsonbPlayerIdsContainment(playerIds: string[]) {
	return JSON.stringify(playerIds);
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
