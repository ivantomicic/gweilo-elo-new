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
		player1Score > player2Score
			? "win"
			: player1Score < player2Score
			? "loss"
			: "draw";
	const player2Result: "win" | "loss" | "draw" =
		player2Score > player1Score
			? "win"
			: player2Score < player1Score
			? "loss"
			: "draw";

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
	const player1MatchCount =
		(rating1?.wins ?? 0) + (rating1?.losses ?? 0) + (rating1?.draws ?? 0);
	const player2MatchCount =
		(rating2?.wins ?? 0) + (rating2?.losses ?? 0) + (rating2?.draws ?? 0);

	// Calculate Elo changes based on current ratings and match counts (for dynamic K-factor)
	// Decimal precision is preserved - no rounding
	const player1Delta = calculateEloDelta(
		player1Elo,
		player2Elo,
		player1Result as MatchResult,
		player1MatchCount
	);
	const player2Delta = calculateEloDelta(
		player2Elo,
		player1Elo,
		player2Result as MatchResult,
		player2MatchCount
	);

	// Determine sets won/lost
	const player1SetsWon = player1Score > player2Score ? 1 : 0;
	const player1SetsLost = player1Score < player2Score ? 1 : 0;
	const player2SetsWon = player2Score > player1Score ? 1 : 0;
	const player2SetsLost = player2Score < player1Score ? 1 : 0;

	// Update player 1 rating
	const { error: error1 } = await supabase.rpc("upsert_player_rating", {
		p_player_id: player1Id,
		p_elo_delta: player1Delta,
		p_wins: player1Result === "win" ? 1 : 0,
		p_losses: player1Result === "loss" ? 1 : 0,
		p_draws: player1Result === "draw" ? 1 : 0,
		p_sets_won: player1SetsWon,
		p_sets_lost: player1SetsLost,
	});

	if (error1) {
		console.error("Error updating player 1 rating:", error1);
		throw new Error(`Failed to update player 1 rating: ${error1.message}`);
	}

	// Update player 2 rating
	const { error: error2 } = await supabase.rpc("upsert_player_rating", {
		p_player_id: player2Id,
		p_elo_delta: player2Delta,
		p_wins: player2Result === "win" ? 1 : 0,
		p_losses: player2Result === "loss" ? 1 : 0,
		p_draws: player2Result === "draw" ? 1 : 0,
		p_sets_won: player2SetsWon,
		p_sets_lost: player2SetsLost,
	});

	if (error2) {
		console.error("Error updating player 2 rating:", error2);
		throw new Error(`Failed to update player 2 rating: ${error2.message}`);
	}
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
		team1Score > team2Score
			? "win"
			: team1Score < team2Score
			? "loss"
			: "draw";
	const team2Result: "win" | "loss" | "draw" =
		team2Score > team1Score
			? "win"
			: team2Score < team1Score
			? "loss"
			: "draw";

	// Get or create teams
	const team1Id = await getOrCreateDoubleTeam(
		team1PlayerIds[0],
		team1PlayerIds[1]
	);
	const team2Id = await getOrCreateDoubleTeam(
		team2PlayerIds[0],
		team2PlayerIds[1]
	);

	// Get current team ratings with match counts
	// Use .maybeSingle() to avoid error when rating doesn't exist yet (first match for team)
	const { data: team1Rating, error: team1RatingError } = await supabase
		.from("double_team_ratings")
		.select("elo, wins, losses, draws")
		.eq("team_id", team1Id)
		.maybeSingle();

	const { data: team2Rating, error: team2RatingError } = await supabase
		.from("double_team_ratings")
		.select("elo, wins, losses, draws")
		.eq("team_id", team2Id)
		.maybeSingle();

	// Log team read for diagnostics
	console.log(
		JSON.stringify({
			tag: "[DOUBLES_TEAM_READ]",
			team1_id: team1Id,
			team1_rating_found: !!team1Rating,
			team1_elo: team1Rating?.elo ?? 1500,
			team1_matches_played: team1Rating
				? (team1Rating.wins ?? 0) +
				  (team1Rating.losses ?? 0) +
				  (team1Rating.draws ?? 0)
				: 0,
			team1_error: team1RatingError?.message,
			team2_id: team2Id,
			team2_rating_found: !!team2Rating,
			team2_elo: team2Rating?.elo ?? 1500,
			team2_matches_played: team2Rating
				? (team2Rating.wins ?? 0) +
				  (team2Rating.losses ?? 0) +
				  (team2Rating.draws ?? 0)
				: 0,
			team2_error: team2RatingError?.message,
		})
	);

	const team1Elo = team1Rating?.elo ?? 1500;
	const team2Elo = team2Rating?.elo ?? 1500;
	const team1MatchCount =
		(team1Rating?.wins ?? 0) +
		(team1Rating?.losses ?? 0) +
		(team1Rating?.draws ?? 0);
	const team2MatchCount =
		(team2Rating?.wins ?? 0) +
		(team2Rating?.losses ?? 0) +
		(team2Rating?.draws ?? 0);

	// Log expectation input source (CRITICAL: must be from double_team_ratings.elo)
	console.log(
		JSON.stringify({
			tag: "[DOUBLES_EXPECTATION_INPUT]",
			team1_id: team1Id,
			team1_elo_source: team1Rating
				? "double_team_ratings.elo"
				: "default_1500_new_team",
			team1_elo: team1Elo,
			team1_rating_found: !!team1Rating,
			team2_id: team2Id,
			team2_elo_source: team2Rating
				? "double_team_ratings.elo"
				: "default_1500_new_team",
			team2_elo: team2Elo,
			team2_rating_found: !!team2Rating,
		})
	);

	// Calculate Elo changes for teams using dynamic K-factor (based on team match count)
	// Decimal precision is preserved - no rounding
	const team1Delta = calculateEloDelta(
		team1Elo,
		team2Elo,
		team1Result as MatchResult,
		team1MatchCount
	);
	const team2Delta = calculateEloDelta(
		team2Elo,
		team1Elo,
		team2Result as MatchResult,
		team2MatchCount
	);

	// Log Elo calculation for diagnostics
	console.log(
		JSON.stringify({
			tag: "[DOUBLES_ELO_CALCULATED]",
			team1_id: team1Id,
			team1_elo_before: team1Elo,
			team1_match_count: team1MatchCount,
			team1_delta: team1Delta,
			team2_id: team2Id,
			team2_elo_before: team2Elo,
			team2_match_count: team2MatchCount,
			team2_delta: team2Delta,
		})
	);

	// Note: For player_double_ratings updates, we use the team delta (as per requirement:
	// "Both players on the same team receive the same Elo delta")
	// The K-factor calculation for teams uses team match count, which is correct.

	// Determine sets won/lost
	const team1SetsWon = team1Score > team2Score ? 1 : 0;
	const team1SetsLost = team1Score < team2Score ? 1 : 0;
	const team2SetsWon = team2Score > team1Score ? 1 : 0;
	const team2SetsLost = team2Score < team1Score ? 1 : 0;

	// Update team ratings
	const { error: team1Error } = await supabase.rpc(
		"upsert_double_team_rating",
		{
			p_team_id: team1Id,
			p_elo_delta: team1Delta,
			p_wins: team1Result === "win" ? 1 : 0,
			p_losses: team1Result === "loss" ? 1 : 0,
			p_draws: team1Result === "draw" ? 1 : 0,
			p_sets_won: team1SetsWon,
			p_sets_lost: team1SetsLost,
		}
	);

	if (team1Error) {
		console.error(
			JSON.stringify({
				tag: "[DOUBLES_TEAM_WRITE_ERROR]",
				team_id: team1Id,
				error: team1Error.message,
				delta: team1Delta,
			})
		);
		throw new Error(
			`Failed to update team 1 rating: ${team1Error.message}`
		);
	}

	// Verify team 1 rating was updated
	const { data: team1RatingAfter, error: team1VerifyError } = await supabase
		.from("double_team_ratings")
		.select("elo, matches_played")
		.eq("team_id", team1Id)
		.maybeSingle();

	console.log(
		JSON.stringify({
			tag: "[DOUBLES_TEAM_WRITE]",
			team1_id: team1Id,
			team1_elo_before: team1Elo,
			team1_elo_after: team1RatingAfter?.elo ?? null,
			team1_delta: team1Delta,
			team1_matches_before: team1MatchCount,
			team1_matches_after: team1RatingAfter?.matches_played ?? null,
			team1_verify_error: team1VerifyError?.message,
		})
	);

	const { error: team2Error } = await supabase.rpc(
		"upsert_double_team_rating",
		{
			p_team_id: team2Id,
			p_elo_delta: team2Delta,
			p_wins: team2Result === "win" ? 1 : 0,
			p_losses: team2Result === "loss" ? 1 : 0,
			p_draws: team2Result === "draw" ? 1 : 0,
			p_sets_won: team2SetsWon,
			p_sets_lost: team2SetsLost,
		}
	);

	if (team2Error) {
		console.error(
			JSON.stringify({
				tag: "[DOUBLES_TEAM_WRITE_ERROR]",
				team_id: team2Id,
				error: team2Error.message,
				delta: team2Delta,
			})
		);
		throw new Error(
			`Failed to update team 2 rating: ${team2Error.message}`
		);
	}

	// Verify team 2 rating was updated
	const { data: team2RatingAfter, error: team2VerifyError } = await supabase
		.from("double_team_ratings")
		.select("elo, matches_played")
		.eq("team_id", team2Id)
		.maybeSingle();

	console.log(
		JSON.stringify({
			tag: "[DOUBLES_TEAM_WRITE]",
			team2_id: team2Id,
			team2_elo_before: team2Elo,
			team2_elo_after: team2RatingAfter?.elo ?? null,
			team2_delta: team2Delta,
			team2_matches_before: team2MatchCount,
			team2_matches_after: team2RatingAfter?.matches_played ?? null,
			team2_verify_error: team2VerifyError?.message,
		})
	);

	// Update individual player double ratings
	// NOTE: Each player gets their own delta based on their match count (for accurate K-factor)
	// However, since we're using team delta, we need to recalculate for each player
	// For simplicity and correctness, we use the team delta for all players on the same team
	// (This matches the requirement: "Both players on the same team receive the same Elo delta")

	// Team 1 players - use team delta (both get same delta)
	const { error: team1Player1Error } = await supabase.rpc(
		"upsert_player_double_rating",
		{
			p_player_id: team1PlayerIds[0],
			p_elo_delta: team1Delta,
			p_wins: team1Result === "win" ? 1 : 0,
			p_losses: team1Result === "loss" ? 1 : 0,
			p_draws: team1Result === "draw" ? 1 : 0,
			p_sets_won: team1SetsWon,
			p_sets_lost: team1SetsLost,
		}
	);

	if (team1Player1Error) {
		console.error(
			"Error updating team 1 player 1 double rating:",
			team1Player1Error
		);
		throw new Error(
			`Failed to update team 1 player 1 double rating: ${team1Player1Error.message}`
		);
	}

	const { error: team1Player2Error } = await supabase.rpc(
		"upsert_player_double_rating",
		{
			p_player_id: team1PlayerIds[1],
			p_elo_delta: team1Delta,
			p_wins: team1Result === "win" ? 1 : 0,
			p_losses: team1Result === "loss" ? 1 : 0,
			p_draws: team1Result === "draw" ? 1 : 0,
			p_sets_won: team1SetsWon,
			p_sets_lost: team1SetsLost,
		}
	);

	if (team1Player2Error) {
		console.error(
			"Error updating team 1 player 2 double rating:",
			team1Player2Error
		);
		throw new Error(
			`Failed to update team 1 player 2 double rating: ${team1Player2Error.message}`
		);
	}

	// Team 2 players - use team delta (both get same delta)
	const { error: team2Player1Error } = await supabase.rpc(
		"upsert_player_double_rating",
		{
			p_player_id: team2PlayerIds[0],
			p_elo_delta: team2Delta,
			p_wins: team2Result === "win" ? 1 : 0,
			p_losses: team2Result === "loss" ? 1 : 0,
			p_draws: team2Result === "draw" ? 1 : 0,
			p_sets_won: team2SetsWon,
			p_sets_lost: team2SetsLost,
		}
	);

	if (team2Player1Error) {
		console.error(
			"Error updating team 2 player 1 double rating:",
			team2Player1Error
		);
		throw new Error(
			`Failed to update team 2 player 1 double rating: ${team2Player1Error.message}`
		);
	}

	const { error: team2Player2Error } = await supabase.rpc(
		"upsert_player_double_rating",
		{
			p_player_id: team2PlayerIds[1],
			p_elo_delta: team2Delta,
			p_wins: team2Result === "win" ? 1 : 0,
			p_losses: team2Result === "loss" ? 1 : 0,
			p_draws: team2Result === "draw" ? 1 : 0,
			p_sets_won: team2SetsWon,
			p_sets_lost: team2SetsLost,
		}
	);

	if (team2Player2Error) {
		console.error(
			"Error updating team 2 player 2 double rating:",
			team2Player2Error
		);
		throw new Error(
			`Failed to update team 2 player 2 double rating: ${team2Player2Error.message}`
		);
	}
}
