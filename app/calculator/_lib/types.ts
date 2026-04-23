import type { MatchResult } from "@/lib/elo/calculation";

export type CalculatorPlayer = {
	id: string;
	name: string;
	avatar: string | null;
	elo: number;
	matchesPlayed: number;
};

export type PlayerWithRating = {
	id: string;
	name: string;
	avatar: string | null;
	elo: number;
	matchesPlayed: number;
};

export type PredictedResults = Record<string, MatchResult>;
