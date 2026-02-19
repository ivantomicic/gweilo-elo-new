import type { MatchResult } from "@/lib/elo/calculation";

export type AdminUser = {
	id: string;
	name: string;
	avatar: string | null;
	email: string;
	role?: string;
};

export type PlayerRating = {
	player_id: string;
	elo: number;
	matches_played: number;
};

export type ProfileRow = {
	id: string;
	display_name: string | null;
	avatar_url: string | null;
};

export type PlayerWithRating = {
	id: string;
	name: string;
	avatar: string | null;
	email: string;
	elo: number;
	matchesPlayed: number;
};

export type PredictedResults = Record<string, MatchResult>;
