import {
	classifyOpportunityAdjustedForm,
	fallbackOpportunityAdjustedForm,
	type FormPerformanceBand,
} from "../elo/form";

export type RecentSessionForm = {
	delta: number;
	band: FormPerformanceBand;
};

/** Five chronological slots, with missing history on the left. */
export function getRecentSessionForm(
	deltas: readonly number[],
	scores?: readonly number[],
): Array<RecentSessionForm | null> {
	const alignedScores = scores?.length === deltas.length ? scores : undefined;
	const entries = deltas.map((delta, index): RecentSessionForm | null => {
		if (!Number.isFinite(delta)) return null;
		const score = alignedScores?.[index];
		return {
			delta,
			band: classifyOpportunityAdjustedForm(
				score !== undefined && Number.isFinite(score)
					? score
					: fallbackOpportunityAdjustedForm(delta),
			),
		};
	}).slice(-5);
	return [...Array<null>(Math.max(0, 5 - entries.length)).fill(null), ...entries];
}
