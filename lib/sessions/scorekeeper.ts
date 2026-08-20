export type ScorekeeperMatchRow = {
	id: string;
	round_number: number;
	match_order: number;
	status: string | null;
	team1_score: number | null;
	team2_score: number | null;
};

export type ScorekeeperRoundSubmission = {
	matchId: string;
	team1Score: number;
	team2Score: number;
};

export function displayMatchOrder(matchOrder: number): number {
	return matchOrder + 1;
}

export function isValidFinalSetScore(
	teamOneScore: unknown,
	teamTwoScore: unknown,
): boolean {
	return (
		Number.isInteger(teamOneScore) &&
		Number.isInteger(teamTwoScore) &&
		Number(teamOneScore) >= 0 &&
		Number(teamTwoScore) >= 0 &&
		Number(teamOneScore) <= 999 &&
		Number(teamTwoScore) <= 999
	);
}

export function currentPendingRoundNumber(
	matches: ScorekeeperMatchRow[],
): number | null {
	const pendingRounds = matches
		.filter((match) => match.status !== "completed")
		.map((match) => match.round_number);

	return pendingRounds.length > 0 ? Math.min(...pendingRounds) : null;
}

export function totalRoundCount(matches: ScorekeeperMatchRow[]): number {
	return matches.reduce(
		(maximum, match) => Math.max(maximum, match.round_number),
		0,
	);
}

export function roundMatches(
	matches: ScorekeeperMatchRow[],
	roundNumber: number,
): ScorekeeperMatchRow[] {
	return matches
		.filter(
			(match) =>
				match.round_number === roundNumber && match.status !== "completed",
		)
		.sort((left, right) => left.match_order - right.match_order);
}

export function roundSubmission(
	matches: ScorekeeperMatchRow[],
): ScorekeeperRoundSubmission[] | null {
	const submissions: ScorekeeperRoundSubmission[] = [];

	for (const match of [...matches].sort(
		(left, right) => left.match_order - right.match_order,
	)) {
		if (
			!Number.isInteger(match.team1_score) ||
			!Number.isInteger(match.team2_score) ||
			match.team1_score! < 0 ||
			match.team2_score! < 0
		) {
			return null;
		}

		submissions.push({
			matchId: match.id,
			team1Score: match.team1_score!,
			team2Score: match.team2_score!,
		});
	}

	return submissions.length > 0 ? submissions : null;
}
