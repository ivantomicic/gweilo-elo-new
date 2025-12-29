/**
 * Pure Elo calculation logic (no database dependencies)
 * 
 * This module contains the core Elo calculation functions that can be used
 * both on the server (for persistence) and client (for previews).
 */

export type MatchResult = "win" | "loss" | "draw";

/**
 * Calculate K-factor based on total matches played
 * 
 * K-factor rules:
 * - First 10 matches → K = 40
 * - Next 30 matches (11–40) → K = 32
 * - 41+ matches → K = 24
 * 
 * @param matchCount - Total matches played (wins + losses + draws)
 * @returns K-factor
 */
export function calculateKFactor(matchCount: number): number {
	if (matchCount < 10) {
		return 40;
	} else if (matchCount < 40) {
		return 32;
	} else {
		return 24;
	}
}

/**
 * Calculate expected score using standard Elo formula
 * 
 * ExpectedScore = 1 / (1 + 10^((opponentElo - playerElo) / 400))
 * 
 * @param playerElo - Current Elo rating of the player
 * @param opponentElo - Current Elo rating of the opponent
 * @returns Expected score (0 to 1)
 */
export function calculateExpectedScore(playerElo: number, opponentElo: number): number {
	return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));
}

/**
 * Calculate actual score from match result
 * 
 * @param result - Match result: "win", "loss", or "draw"
 * @returns Actual score (0, 0.5, or 1)
 */
export function getActualScore(result: MatchResult): number {
	switch (result) {
		case "win":
			return 1.0;
		case "loss":
			return 0.0;
		case "draw":
			return 0.5;
	}
}

/**
 * Calculate Elo change (delta) for a match
 * 
 * Uses standard Elo formula:
 * NewElo = OldElo + K * (ActualScore - ExpectedScore)
 * 
 * @param playerElo - Current Elo rating of the player
 * @param opponentElo - Current Elo rating of the opponent
 * @param result - Match result: "win", "loss", or "draw"
 * @param matchCount - Total matches played by the player (for K-factor calculation)
 * @returns Elo change (positive for win, negative for loss)
 */
export function calculateEloDelta(
	playerElo: number,
	opponentElo: number,
	result: MatchResult,
	matchCount: number = 0
): number {
	const K = calculateKFactor(matchCount);
	const expectedScore = calculateExpectedScore(playerElo, opponentElo);
	const actualScore = getActualScore(result);

	const delta = K * (actualScore - expectedScore);
	return Math.round(delta);
}

