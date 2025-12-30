import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Normalize player pair to ensure consistent ordering (smaller ID first)
 * This ensures A+B == B+A when looking up teams
 */
export function normalizePlayerPair(player1Id: string, player2Id: string): [string, string] {
	return player1Id < player2Id ? [player1Id, player2Id] : [player2Id, player1Id];
}

/**
 * Get or create a double team for a pair of players
 * 
 * @param player1Id - First player ID
 * @param player2Id - Second player ID
 * @returns The team ID
 */
export async function getOrCreateDoubleTeam(
	player1Id: string,
	player2Id: string
): Promise<string> {
	const supabase = createAdminClient();

	// Normalize pair (ensure player_1_id < player_2_id)
	const [p1, p2] = normalizePlayerPair(player1Id, player2Id);

	// Check if team already exists
	// Use .maybeSingle() instead of .single() to avoid error when no row exists
	const { data: existingTeam, error: findError } = await supabase
		.from("double_teams")
		.select("id")
		.eq("player_1_id", p1)
		.eq("player_2_id", p2)
		.maybeSingle();

	if (findError) {
		console.error("Error finding double team:", findError);
		throw new Error(`Failed to find double team: ${findError.message}`);
	}

	if (existingTeam) {
		console.log(JSON.stringify({
			tag: "[DOUBLES_TEAM_FOUND]",
			player1_id: p1,
			player2_id: p2,
			team_id: existingTeam.id,
		}));
		return existingTeam.id;
	}

	// Team doesn't exist, create it
	// Use upsert to handle race condition (if another request creates it simultaneously)
	const { data: newTeam, error: createError } = await supabase
		.from("double_teams")
		.insert({
			player_1_id: p1,
			player_2_id: p2,
		})
		.select("id")
		.single();

	// If insert fails due to unique constraint (race condition), try to fetch again
	if (createError) {
		// Check if error is due to unique constraint violation
		if (createError.code === "23505" || createError.message.includes("duplicate") || createError.message.includes("unique")) {
			// Race condition: another request created the team, fetch it
			const { data: raceTeam, error: raceError } = await supabase
				.from("double_teams")
				.select("id")
				.eq("player_1_id", p1)
				.eq("player_2_id", p2)
				.maybeSingle();

			if (raceError || !raceTeam) {
				throw new Error(`Failed to create/fetch double team after race condition: ${raceError?.message || "Unknown error"}`);
			}

			console.log(JSON.stringify({
				tag: "[DOUBLES_TEAM_CREATED_RACE]",
				player1_id: p1,
				player2_id: p2,
				team_id: raceTeam.id,
			}));
			return raceTeam.id;
		}

		throw new Error(`Failed to create double team: ${createError.message}`);
	}

	if (!newTeam) {
		throw new Error("Failed to create double team: No team returned");
	}

	console.log(JSON.stringify({
		tag: "[DOUBLES_TEAM_CREATED]",
		player1_id: p1,
		player2_id: p2,
		team_id: newTeam.id,
	}));

	return newTeam.id;
}

