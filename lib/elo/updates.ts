import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePlayerPair, getOrCreateDoubleTeam } from "./double-teams";
import { calculateEloDelta, type MatchResult } from "./calculation";

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

	// Get current ratings with match counts (defaults to 1500 if player doesn't have a rating yet)
	const { data: rating1 } = await supabase
		.from("player_ratings")
		.select("elo, wins, losses, draws")
		.eq("player_id", player1Id)
		.single();

	const { data: rating2 } = await supabase
		.from("player_ratings")
		.select("elo, wins, losses, draws")
		.eq("player_id", player2Id)
		.single();

	const player1Elo = rating1?.elo ?? 1500;
	const player2Elo = rating2?.elo ?? 1500;
	const player1MatchCount = (rating1?.wins ?? 0) + (rating1?.losses ?? 0) + (rating1?.draws ?? 0);
	const player2MatchCount = (rating2?.wins ?? 0) + (rating2?.losses ?? 0) + (rating2?.draws ?? 0);

	// Calculate Elo changes based on current ratings and match counts (for dynamic K-factor)
	const player1Delta = calculateEloDelta(player1Elo, player2Elo, player1Result as MatchResult, player1MatchCount);
	const player2Delta = calculateEloDelta(player2Elo, player1Elo, player2Result as MatchResult, player2MatchCount);

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

	// Get current team ratings with match counts (defaults to 1500 if team doesn't have a rating yet)
	const { data: team1Rating } = await supabase
		.from("double_team_ratings")
		.select("elo, wins, losses, draws")
		.eq("team_id", team1Id)
		.single();

	const { data: team2Rating } = await supabase
		.from("double_team_ratings")
		.select("elo, wins, losses, draws")
		.eq("team_id", team2Id)
		.single();

	const team1Elo = team1Rating?.elo ?? 1500;
	const team2Elo = team2Rating?.elo ?? 1500;
	const team1MatchCount = (team1Rating?.wins ?? 0) + (team1Rating?.losses ?? 0) + (team1Rating?.draws ?? 0);
	const team2MatchCount = (team2Rating?.wins ?? 0) + (team2Rating?.losses ?? 0) + (team2Rating?.draws ?? 0);

	// Calculate Elo changes for teams using dynamic K-factor (based on team match count)
	const team1Delta = calculateEloDelta(team1Elo, team2Elo, team1Result as MatchResult, team1MatchCount);
	const team2Delta = calculateEloDelta(team2Elo, team1Elo, team2Result as MatchResult, team2MatchCount);

	// Note: For player_double_ratings updates, we use the team delta (as per requirement:
	// "Both players on the same team receive the same Elo delta")
	// The K-factor calculation for teams uses team match count, which is correct.

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

	// Update individual player double ratings
	// NOTE: Each player gets their own delta based on their match count (for accurate K-factor)
	// However, since we're using team delta, we need to recalculate for each player
	// For simplicity and correctness, we use the team delta for all players on the same team
	// (This matches the requirement: "Both players on the same team receive the same Elo delta")
	
	// Team 1 players - use team delta (both get same delta)
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

	// Team 2 players - use team delta (both get same delta)
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

