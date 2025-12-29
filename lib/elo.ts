/**
 * Elo calculation helpers
 * 
 * These functions use the shared Elo calculation logic for UI previews.
 * For actual persistence, use the functions in lib/elo/updates.ts
 */

import { calculateEloDelta, type MatchResult } from "./elo/calculation";

/**
 * Calculate estimated Elo change for a player (for UI preview)
 * 
 * Note: This uses matchCount = 0 (default K-factor) for previews.
 * Actual calculations use the real match count from the database.
 * 
 * @param playerElo - Current Elo rating of the player
 * @param opponentElo - Current Elo rating of the opponent(s)
 * @param outcome - "win", "draw", or "lose"
 * @param matchCount - Optional match count for more accurate K-factor (defaults to 0 for preview)
 * @returns Estimated Elo change (positive for win, negative for lose)
 */
export function calculateEloChange(
	playerElo: number,
	opponentElo: number,
	outcome: "win" | "draw" | "lose",
	matchCount: number = 0
): number {
	const result: MatchResult = outcome === "lose" ? "loss" : outcome;
	return calculateEloDelta(playerElo, opponentElo, result, matchCount);
}

/**
 * Calculate average Elo for a team (doubles)
 */
export function averageElo(playerElos: number[]): number {
	if (playerElos.length === 0) return 1500;
	return Math.round(playerElos.reduce((sum, elo) => sum + elo, 0) / playerElos.length);
}

