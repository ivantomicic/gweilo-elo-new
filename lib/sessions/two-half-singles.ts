export type TwoHalfSinglesMatch = {
	id: string;
	round_number: number;
	match_order: number;
	match_type: "singles" | "doubles";
	player_ids: string[];
	team1_score?: number | null;
	team2_score?: number | null;
};

export type TwoHalfSinglesConfig = {
	halfRoundCount: number;
	matchesPerRound: number;
};

export type TwoHalfScore = {
	team1Score: number;
	team2Score: number;
};

const FORMAT_BY_PLAYER_COUNT: Record<number, TwoHalfSinglesConfig | undefined> = {
	4: { halfRoundCount: 3, matchesPerRound: 2 },
	5: { halfRoundCount: 5, matchesPerRound: 2 },
	6: { halfRoundCount: 5, matchesPerRound: 3 },
};

const pairKey = (playerIDs: string[]) =>
	playerIDs.length === 2 ? [...playerIDs].sort().join(":") : null;

export function detectTwoHalfSinglesSession(
	playerCount: number,
	matches: TwoHalfSinglesMatch[],
): TwoHalfSinglesConfig | null {
	const config = FORMAT_BY_PLAYER_COUNT[playerCount];
	if (!config) return null;

	const expectedRoundCount = config.halfRoundCount * 2;
	const rounds = new Map<number, TwoHalfSinglesMatch[]>();
	for (const match of matches) {
		const roundMatches = rounds.get(match.round_number) ?? [];
		roundMatches.push(match);
		rounds.set(match.round_number, roundMatches);
	}

	if (
		rounds.size !== expectedRoundCount ||
		Math.max(...rounds.keys()) !== expectedRoundCount
	) {
		return null;
	}

	for (let roundNumber = 1; roundNumber <= expectedRoundCount; roundNumber++) {
		const roundMatches = rounds.get(roundNumber);
		if (
			!roundMatches ||
			roundMatches.length !== config.matchesPerRound ||
			roundMatches.some(
				(match) =>
					match.match_type !== "singles" ||
					pairKey(match.player_ids) === null,
			)
		) {
			return null;
		}
	}

	for (let roundNumber = 1; roundNumber <= config.halfRoundCount; roundNumber++) {
		const firstHalfMatches = rounds.get(roundNumber)!;
		const secondHalfMatches = rounds.get(
			roundNumber + config.halfRoundCount,
		)!;
		const secondHalfByOrder = new Map(
			secondHalfMatches.map((match) => [match.match_order, match]),
		);

		for (const firstHalfMatch of firstHalfMatches) {
			const secondHalfMatch = secondHalfByOrder.get(
				firstHalfMatch.match_order,
			);
			if (
				!secondHalfMatch ||
				pairKey(firstHalfMatch.player_ids) !==
					pairKey(secondHalfMatch.player_ids)
			) {
				return null;
			}
		}
	}

	return config;
}

export function getPairedRoundNumber(
	roundNumber: number,
	config: TwoHalfSinglesConfig,
): number {
	return roundNumber <= config.halfRoundCount
		? roundNumber + config.halfRoundCount
		: roundNumber - config.halfRoundCount;
}

export function findPairedMatch<T extends TwoHalfSinglesMatch>(
	match: T,
	allMatches: T[],
	config: TwoHalfSinglesConfig,
): T | null {
	const pairedRoundNumber = getPairedRoundNumber(match.round_number, config);
	const expectedPair = pairKey(match.player_ids);

	return (
		allMatches.find(
			(candidate) =>
				candidate.round_number === pairedRoundNumber &&
				candidate.match_order === match.match_order &&
				pairKey(candidate.player_ids) === expectedPair,
		) ?? null
	);
}

export function combineTwoHalfSinglesScore(
	firstHalfMatch: TwoHalfSinglesMatch,
	secondHalfMatch: TwoHalfSinglesMatch,
	secondHalfScore: TwoHalfScore,
): TwoHalfScore | null {
	if (
		firstHalfMatch.match_type !== "singles" ||
		secondHalfMatch.match_type !== "singles" ||
		!Number.isInteger(firstHalfMatch.team1_score) ||
		!Number.isInteger(firstHalfMatch.team2_score)
	) {
		return null;
	}

	const firstHalfPlayers = firstHalfMatch.player_ids;
	const secondHalfPlayers = secondHalfMatch.player_ids;

	if (
		firstHalfPlayers[0] === secondHalfPlayers[0] &&
		firstHalfPlayers[1] === secondHalfPlayers[1]
	) {
		return {
			team1Score:
				firstHalfMatch.team1_score! + secondHalfScore.team1Score,
			team2Score:
				firstHalfMatch.team2_score! + secondHalfScore.team2Score,
		};
	}

	if (
		firstHalfPlayers[0] === secondHalfPlayers[1] &&
		firstHalfPlayers[1] === secondHalfPlayers[0]
	) {
		return {
			team1Score:
				firstHalfMatch.team2_score! + secondHalfScore.team1Score,
			team2Score:
				firstHalfMatch.team1_score! + secondHalfScore.team2Score,
		};
	}

	return null;
}

export function getEffectiveTwoHalfSinglesScore<
	T extends TwoHalfSinglesMatch,
>(
	match: T,
	allMatches: T[],
	config: TwoHalfSinglesConfig | null,
): TwoHalfScore | null {
	if (
		!Number.isInteger(match.team1_score) ||
		!Number.isInteger(match.team2_score)
	) {
		return null;
	}

	if (!config || match.round_number <= config.halfRoundCount) {
		return {
			team1Score: match.team1_score!,
			team2Score: match.team2_score!,
		};
	}

	const firstHalfMatch = findPairedMatch(match, allMatches, config);
	if (!firstHalfMatch) return null;

	return combineTwoHalfSinglesScore(firstHalfMatch, match, {
		team1Score: match.team1_score!,
		team2Score: match.team2_score!,
	});
}
