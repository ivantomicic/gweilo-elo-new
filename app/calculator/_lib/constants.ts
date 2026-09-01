import type { MatchResult } from "@/lib/elo/calculation";

export const RESULT_OPTIONS: ReadonlyArray<{
	value: MatchResult;
	label: string;
	shortLabel: string;
}> = [
	{
		value: "win",
		label: "Pobeda",
		shortLabel: "P",
	},
	{
		value: "draw",
		label: "Nerešeno",
		shortLabel: "N",
	},
	{
		value: "loss",
		label: "Poraz",
		shortLabel: "I",
	},
];
