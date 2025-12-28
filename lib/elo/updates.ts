import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePlayerPair, getOrCreateDoubleTeam } from "./double-teams";

/**
 * Calculate Elo change based on result
 * 
 * @param playerElo - Current Elo rating
 * @param opponentElo - Opponent(s) Elo rating
 * @param result - "win", "loss", or "draw"
 * @returns Elo change (positive for win, negative for loss)
 */
function calculateEloDelta(
	playerElo: number,
	opponentElo: number,
	result: "win" | "loss" | "draw"
): number {
	const K = 32; // Elo K-factor
	const expectedScore = 1 / (1 + Math.pow(10, (opponentElo - playerElo) / 400));

	let actualScore: number;
	if (result === "win") {
		actualScore = 1.0;
	} else if (result === "loss") {
		actualScore = 0.0;
	} else {
		actualScore = 0.5;
	}

	return Math.round(K * (actualScore - expectedScore));
}

/**
 * Update player ratings for a singles match
 * 
 * @param player1Id - First player ID
 * @param player2Id - Second player ID
 * @param player1Score - First player's score
 * @param player2Score - Second player's score
 */
export async function updateSinglesRatings(
	player1Id: string,
	player2Id: string,
	player1Score: number,
	player2Score: number
) {
	const supabase = createAdminClient();

	// Determine result
	const player1Result: "win" | "loss" | "draw" =
		player1Score > player2Score ? "win" : player1Score < player2Score ? "loss" : "draw";
	const player2Result: "win" | "loss" | "draw" =
		player2Score > player1Score ? "win" : player2Score < player1Score ? "loss" : "draw";

	// Get current ratings (defaults to 1500 if player doesn't have a rating yet)
	const { data: rating1 } = await supabase
		.from("player_ratings")
		.select("elo")
		.eq("player_id", player1Id)
		.single();

	const { data: rating2 } = await supabase
		.from("player_ratings")
		.select("elo")
		.eq("player_id", player2Id)
		.single();

	const player1Elo = rating1?.elo ?? 1500;
	const player2Elo = rating2?.elo ?? 1500;

	// Calculate Elo changes based on current ratings
	const player1Delta = calculateEloDelta(player1Elo, player2Elo, player1Result);
	const player2Delta = calculateEloDelta(player2Elo, player1Elo, player2Result);

	// Determine sets won/lost
	const player1SetsWon = player1Score > player2Score ? 1 : 0;
	const player1SetsLost = player1Score < player2Score ? 1 : 0;
	const player2SetsWon = player2Score > player1Score ? 1 : 0;
	const player2SetsLost = player2Score < player1Score ? 1 : 0;

	// Update player 1 rating
	await supabase.rpc("upsert_player_rating", {
		p_player_id: player1Id,
		p_elo_delta: player1Delta,
		p_wins: player1Result === "win" ? 1 : 0,
		p_losses: player1Result === "loss" ? 1 : 0,
		p_draws: player1Result === "draw" ? 1 : 0,
		p_sets_won: player1SetsWon,
		p_sets_lost: player1SetsLost,
	});

	// Update player 2 rating
	await supabase.rpc("upsert_player_rating", {
		p_player_id: player2Id,
		p_elo_delta: player2Delta,
		p_wins: player2Result === "win" ? 1 : 0,
		p_losses: player2Result === "loss" ? 1 : 0,
		p_draws: player2Result === "draw" ? 1 : 0,
		p_sets_won: player2SetsWon,
		p_sets_lost: player2SetsLost,
	});
}

/**
 * Update ratings for a doubles match
 * 
 * @param team1PlayerIds - [player1, player2] for team 1
 * @param team2PlayerIds - [player3, player4] for team 2
 * @param team1Score - Team 1's score
 * @param team2Score - Team 2's score
 */
export async function updateDoublesRatings(
	team1PlayerIds: [string, string],
	team2PlayerIds: [string, string],
	team1Score: number,
	team2Score: number
) {
	const supabase = createAdminClient();

	// Determine result
	const team1Result: "win" | "loss" | "draw" =
		team1Score > team2Score ? "win" : team1Score < team2Score ? "loss" : "draw";
	const team2Result: "win" | "loss" | "draw" =
		team2Score > team1Score ? "win" : team2Score < team1Score ? "loss" : "draw";

	// Get or create teams
	const team1Id = await getOrCreateDoubleTeam(team1PlayerIds[0], team1PlayerIds[1]);
	const team2Id = await getOrCreateDoubleTeam(team2PlayerIds[0], team2PlayerIds[1]);

	// Get current team ratings (defaults to 1500 if team doesn't have a rating yet)
	const { data: team1Rating } = await supabase
		.from("double_team_ratings")
		.select("elo")
		.eq("team_id", team1Id)
		.single();

	const { data: team2Rating } = await supabase
		.from("double_team_ratings")
		.select("elo")
		.eq("team_id", team2Id)
		.single();

	const team1Elo = team1Rating?.elo ?? 1500;
	const team2Elo = team2Rating?.elo ?? 1500;

	// Calculate Elo changes for teams
	const team1Delta = calculateEloDelta(team1Elo, team2Elo, team1Result);
	const team2Delta = calculateEloDelta(team2Elo, team1Elo, team2Result);

	// Determine sets won/lost
	const team1SetsWon = team1Score > team2Score ? 1 : 0;
	const team1SetsLost = team1Score < team2Score ? 1 : 0;
	const team2SetsWon = team2Score > team1Score ? 1 : 0;
	const team2SetsLost = team2Score < team1Score ? 1 : 0;

	// Update team ratings
	await supabase.rpc("upsert_double_team_rating", {
		p_team_id: team1Id,
		p_elo_delta: team1Delta,
		p_wins: team1Result === "win" ? 1 : 0,
		p_losses: team1Result === "loss" ? 1 : 0,
		p_draws: team1Result === "draw" ? 1 : 0,
		p_sets_won: team1SetsWon,
		p_sets_lost: team1SetsLost,
	});

	await supabase.rpc("upsert_double_team_rating", {
		p_team_id: team2Id,
		p_elo_delta: team2Delta,
		p_wins: team2Result === "win" ? 1 : 0,
		p_losses: team2Result === "loss" ? 1 : 0,
		p_draws: team2Result === "draw" ? 1 : 0,
		p_sets_won: team2SetsWon,
		p_sets_lost: team2SetsLost,
	});

	// Update individual player double ratings (all 4 players get the same delta as their team)
	// Team 1 players
	await supabase.rpc("upsert_player_double_rating", {
		p_player_id: team1PlayerIds[0],
		p_elo_delta: team1Delta,
		p_wins: team1Result === "win" ? 1 : 0,
		p_losses: team1Result === "loss" ? 1 : 0,
		p_draws: team1Result === "draw" ? 1 : 0,
		p_sets_won: team1SetsWon,
		p_sets_lost: team1SetsLost,
	});

	await supabase.rpc("upsert_player_double_rating", {
		p_player_id: team1PlayerIds[1],
		p_elo_delta: team1Delta,
		p_wins: team1Result === "win" ? 1 : 0,
		p_losses: team1Result === "loss" ? 1 : 0,
		p_draws: team1Result === "draw" ? 1 : 0,
		p_sets_won: team1SetsWon,
		p_sets_lost: team1SetsLost,
	});

	// Team 2 players
	await supabase.rpc("upsert_player_double_rating", {
		p_player_id: team2PlayerIds[0],
		p_elo_delta: team2Delta,
		p_wins: team2Result === "win" ? 1 : 0,
		p_losses: team2Result === "loss" ? 1 : 0,
		p_draws: team2Result === "draw" ? 1 : 0,
		p_sets_won: team2SetsWon,
		p_sets_lost: team2SetsLost,
	});

	await supabase.rpc("upsert_player_double_rating", {
		p_player_id: team2PlayerIds[1],
		p_elo_delta: team2Delta,
		p_wins: team2Result === "win" ? 1 : 0,
		p_losses: team2Result === "loss" ? 1 : 0,
		p_draws: team2Result === "draw" ? 1 : 0,
		p_sets_won: team2SetsWon,
		p_sets_lost: team2SetsLost,
	});
}

