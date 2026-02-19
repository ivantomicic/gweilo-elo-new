import type { MatchResult } from "@/lib/elo/calculation";

export const RESULT_OPTIONS: ReadonlyArray<{
	value: MatchResult;
	label: string;
}> = [
	{
		value: "win",
		label: "Win",
	},
	{
		value: "draw",
		label: "Draw",
	},
	{
		value: "loss",
		label: "Loss",
	},
];
