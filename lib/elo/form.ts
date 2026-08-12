export type FormPerformanceObservation = {
	actualScore: number;
	expectedScore: number;
};

export type FormPerformanceBand = "good" | "neutral" | "bad";

export type FormPerformanceBreakdown = {
	actualScore: number;
	expectedScore: number;
	performanceAboveExpectation: number;
	positiveOpportunity: number;
	negativeOpportunity: number;
	availableOpportunity: number;
	score: number;
};

export const FORM_PERFORMANCE_THRESHOLD = 0.3;

const clamp = (value: number, minimum: number, maximum: number) =>
	Math.min(maximum, Math.max(minimum, value));

export function calculateOpportunityAdjustedForm(
	observations: FormPerformanceObservation[],
): number {
	return calculateOpportunityAdjustedFormBreakdown(observations).score;
}

export function calculateOpportunityAdjustedFormBreakdown(
	observations: FormPerformanceObservation[],
): FormPerformanceBreakdown {
	if (observations.length === 0) {
		return {
			actualScore: 0,
			expectedScore: 0,
			performanceAboveExpectation: 0,
			positiveOpportunity: 0,
			negativeOpportunity: 0,
			availableOpportunity: 0,
			score: 0,
		};
	}

	let actualScoreTotal = 0;
	let expectedScoreTotal = 0;
	let performanceAboveExpectation = 0;
	let positiveOpportunity = 0;
	let negativeOpportunity = 0;

	for (const observation of observations) {
		const actualScore = clamp(observation.actualScore, 0, 1);
		const expectedScore = clamp(observation.expectedScore, 0, 1);
		actualScoreTotal += actualScore;
		expectedScoreTotal += expectedScore;
		performanceAboveExpectation += actualScore - expectedScore;
		positiveOpportunity += 1 - expectedScore;
		negativeOpportunity += expectedScore;
	}

	const opportunity =
		performanceAboveExpectation >= 0
			? positiveOpportunity
			: negativeOpportunity;
	const score =
		opportunity <= Number.EPSILON
			? 0
			: clamp(performanceAboveExpectation / opportunity, -1, 1);

	return {
		actualScore: actualScoreTotal,
		expectedScore: expectedScoreTotal,
		performanceAboveExpectation,
		positiveOpportunity,
		negativeOpportunity,
		availableOpportunity: opportunity,
		score,
	};
}

export function fallbackOpportunityAdjustedForm(eloDelta: number): number {
	if (!Number.isFinite(eloDelta)) return 0;
	return clamp(eloDelta / 5, -1, 1);
}

export function classifyOpportunityAdjustedForm(
	formScore: number,
): FormPerformanceBand {
	if (formScore >= FORM_PERFORMANCE_THRESHOLD) return "good";
	if (formScore <= -FORM_PERFORMANCE_THRESHOLD) return "bad";
	return "neutral";
}
