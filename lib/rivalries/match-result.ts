export function getSinglesWinnerId(
	player1Id: string,
	player2Id: string,
	team1Score: number | null,
	team2Score: number | null,
) {
	const score1 = team1Score ?? 0;
	const score2 = team2Score ?? 0;
	if (score1 === score2) return null;
	return score1 > score2 ? player1Id : player2Id;
}
