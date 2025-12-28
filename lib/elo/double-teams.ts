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
	const { data: existingTeam, error: findError } = await supabase
		.from("double_teams")
		.select("id")
		.eq("player_1_id", p1)
		.eq("player_2_id", p2)
		.single();

	if (existingTeam && !findError) {
		return existingTeam.id;
	}

	// Team doesn't exist, create it
	const { data: newTeam, error: createError } = await supabase
		.from("double_teams")
		.insert({
			player_1_id: p1,
			player_2_id: p2,
		})
		.select("id")
		.single();

	if (createError || !newTeam) {
		throw new Error(`Failed to create double team: ${createError?.message || "Unknown error"}`);
	}

	return newTeam.id;
}

