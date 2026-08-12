export type FormPerformanceObservation = {
	actualScore: number;
	expectedScore: number;
};

export type FormPerformanceBand = "good" | "neutral" | "bad";

export const FORM_PERFORMANCE_THRESHOLD = 0.3;

const clamp = (value: number, minimum: number, maximum: number) =>
	Math.min(maximum, Math.max(minimum, value));

export function calculateOpportunityAdjustedForm(
	observations: FormPerformanceObservation[],
): number {
	if (observations.length === 0) return 0;

	let performanceAboveExpectation = 0;
	let positiveOpportunity = 0;
	let negativeOpportunity = 0;

	for (const observation of observations) {
		const actualScore = clamp(observation.actualScore, 0, 1);
		const expectedScore = clamp(observation.expectedScore, 0, 1);
		performanceAboveExpectation += actualScore - expectedScore;
		positiveOpportunity += 1 - expectedScore;
		negativeOpportunity += expectedScore;
	}

	const opportunity =
		performanceAboveExpectation >= 0
			? positiveOpportunity
			: negativeOpportunity;
	if (opportunity <= Number.EPSILON) return 0;

	return clamp(performanceAboveExpectation / opportunity, -1, 1);
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
