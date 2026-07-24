export type EloHistoryMatchResult = "win" | "loss" | "draw";

export type EloHistoryMatchPerspective = {
	scoreFor: number | null;
	scoreAgainst: number | null;
	result: EloHistoryMatchResult | null;
};

function normalizeScore(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}

	return null;
}

export function buildEloHistoryMatchPerspective(
	isFirstSide: boolean,
	team1Score: unknown,
	team2Score: unknown,
): EloHistoryMatchPerspective {
	const firstScore = normalizeScore(team1Score);
	const secondScore = normalizeScore(team2Score);
	const scoreFor = isFirstSide ? firstScore : secondScore;
	const scoreAgainst = isFirstSide ? secondScore : firstScore;

	if (scoreFor === null || scoreAgainst === null) {
		return {
			scoreFor,
			scoreAgainst,
			result: null,
		};
	}

	return {
		scoreFor,
		scoreAgainst,
		result:
			scoreFor > scoreAgainst
				? "win"
				: scoreFor < scoreAgainst
					? "loss"
					: "draw",
	};
}
