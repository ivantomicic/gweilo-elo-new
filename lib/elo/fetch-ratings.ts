import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Player data with Elo ratings
 */
export type PlayerWithRatings = {
	player_id: string;
	display_name: string;
	avatar: string | null;
	singles_elo: number;
	doubles_elo: number | null; // Optional, only included if needed
};

/**
 * Fetch player data with Elo ratings from player_ratings and player_double_ratings tables
 * 
 * Efficiently fetches ratings using batch queries (not N+1).
 * Defaults to 1500 if no rating exists.
 * 
 * Note: This function requires admin client to access auth.users.
 * For server-side usage, pass createAdminClient().
 * 
 * @param supabase - Supabase client (should be admin client for auth.users access)
 * @param playerIds - Array of player UUIDs to fetch
 * @param includeDoublesElo - Whether to include doubles Elo (default: false)
 * @returns Array of players with their ratings
 */
export async function fetchPlayersWithRatings(
	supabase: SupabaseClient,
	playerIds: string[],
	includeDoublesElo: boolean = false
): Promise<PlayerWithRatings[]> {
	if (playerIds.length === 0) {
		return [];
	}

	// Fetch user details using admin client (needed to access auth.users)
	const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();

	if (usersError) {
		throw new Error(`Failed to fetch users: ${usersError.message}`);
	}

	// Filter to only requested players
	const requestedUsers = users.filter((u) => playerIds.includes(u.id));

	// Fetch singles ratings in batch
	const { data: singlesRatings, error: singlesError } = await supabase
		.from("player_ratings")
		.select("player_id, elo")
		.in("player_id", playerIds);

	if (singlesError) {
		console.error("Error fetching singles ratings:", singlesError);
		throw new Error(`Failed to fetch singles ratings: ${singlesError.message}`);
	}

	// Debug: Log what we fetched
	console.log(`[fetchPlayersWithRatings] Fetched ratings for ${playerIds.length} players:`, {
		requestedPlayerIds: playerIds,
		foundRatings: (singlesRatings || []).map(r => ({ player_id: r.player_id, elo: r.elo })),
		ratingsCount: (singlesRatings || []).length
	});

	// Fetch doubles ratings if needed
	let doublesRatings: Array<{ player_id: string; elo: number }> = [];
	if (includeDoublesElo) {
		const { data: doublesData, error: doublesError } = await supabase
			.from("player_double_ratings")
			.select("player_id, elo")
			.in("player_id", playerIds);

		if (doublesError) {
			throw new Error(`Failed to fetch doubles ratings: ${doublesError.message}`);
		}

		doublesRatings = doublesData || [];
	}

	// Create maps for fast lookup
	// Convert elo to number in case it's returned as string from NUMERIC type
	const singlesMap = new Map(
		(singlesRatings || []).map((r) => [r.player_id, typeof r.elo === 'string' ? parseFloat(r.elo) : Number(r.elo)])
	);
	const doublesMap = new Map(
		doublesRatings.map((r) => [r.player_id, typeof r.elo === 'string' ? parseFloat(r.elo) : Number(r.elo)])
	);

	// Combine user data with ratings
	const playersWithRatings: PlayerWithRatings[] = requestedUsers.map((user) => {
		const displayName =
			user.user_metadata?.display_name ||
			user.user_metadata?.name ||
			user.user_metadata?.full_name ||
			user.email?.split("@")[0] ||
			"User";

		const avatar = user.user_metadata?.avatar_url || null;
		const singlesElo = singlesMap.get(user.id) ?? 1500;
		const doublesElo = includeDoublesElo ? (doublesMap.get(user.id) ?? 1500) : null;

		// Debug: Log if using default 1500
		if (!singlesMap.has(user.id)) {
			console.log(`[fetchPlayersWithRatings] No rating found for player ${user.id} (${displayName}), using default 1500`);
		}

		return {
			player_id: user.id,
			display_name: displayName,
			avatar,
			singles_elo: singlesElo,
			doubles_elo: doublesElo,
		};
	});

	return playersWithRatings;
}

