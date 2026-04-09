/**
 * Pure Elo calculation logic (no database dependencies)
 * 
 * This module contains the core Elo calculation functions that can be used
 * both on the server (for persistence) and client (for previews).
 */

export type MatchResult = "win" | "loss" | "draw";
export type DoublesPlayerParticipant = {
	elo: number;
	matchCount: number;
};

export type DoublesPlayerDeltaResult = {
	team1AverageElo: number;
	team2AverageElo: number;
	team1AverageMatchCount: number;
	team2AverageMatchCount: number;
	team1Delta: number;
	team2Delta: number;
};

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
 * @returns Elo change (positive for win, negative for loss) - decimal precision preserved
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
	return delta; // Return decimal delta - no rounding
}

function getOpposingResult(result: MatchResult): MatchResult {
	switch (result) {
		case "win":
			return "loss";
		case "loss":
			return "win";
		case "draw":
			return "draw";
	}
}

/**
 * Calculate player_double_ratings deltas for a doubles match.
 *
 * This is intentionally separate from double_team_ratings:
 * - team ratings use the pair's own team Elo
 * - player doubles ratings use the average of each team's individual doubles Elo
 *
 * Both players on the same team receive the same player-doubles delta.
 */
export function calculateDoublesPlayerDeltas(
	team1: [DoublesPlayerParticipant, DoublesPlayerParticipant],
	team2: [DoublesPlayerParticipant, DoublesPlayerParticipant],
	team1Result: MatchResult
): DoublesPlayerDeltaResult {
	const team2Result = getOpposingResult(team1Result);
	const team1AverageElo = (team1[0].elo + team1[1].elo) / 2;
	const team2AverageElo = (team2[0].elo + team2[1].elo) / 2;
	const team1AverageMatchCount =
		(team1[0].matchCount + team1[1].matchCount) / 2;
	const team2AverageMatchCount =
		(team2[0].matchCount + team2[1].matchCount) / 2;

	return {
		team1AverageElo,
		team2AverageElo,
		team1AverageMatchCount,
		team2AverageMatchCount,
		team1Delta: calculateEloDelta(
			team1AverageElo,
			team2AverageElo,
			team1Result,
			team1AverageMatchCount
		),
		team2Delta: calculateEloDelta(
			team2AverageElo,
			team1AverageElo,
			team2Result,
			team2AverageMatchCount
		),
	};
}
