import type { createAdminClient } from "@/lib/supabase/admin";
import type { AtomicMatch, RatingInput } from "./round-transaction";

type AdminClient = ReturnType<typeof createAdminClient>;
type DatabaseRow = Record<string, unknown>;

function databaseRating(row?: DatabaseRow): RatingInput["state"] {
	const number = (key: string, fallback = 0) => Number(row?.[key] ?? fallback);
	return {
		exists: Boolean(row),
		elo: number("elo", 1500),
		matches_played: number("matches_played"),
		wins: number("wins"),
		losses: number("losses"),
		draws: number("draws"),
		sets_won: number("sets_won"),
		sets_lost: number("sets_lost"),
	};
}

export async function loadAtomicRatingInputs(
	adminClient: AdminClient,
	matches: AtomicMatch[],
): Promise<RatingInput[]> {
	const singlesIds = new Set<string>();
	const doublesPlayerIds = new Set<string>();
	const teamIds = new Set<string>();
	for (const match of matches) {
		if (match.is_rated === false) continue;
		if (match.match_type === "singles") match.player_ids.forEach((id) => singlesIds.add(id));
		else {
			match.player_ids.forEach((id) => doublesPlayerIds.add(id));
			if (match.team_1_id) teamIds.add(match.team_1_id);
			if (match.team_2_id) teamIds.add(match.team_2_id);
		}
	}
	const fields = "elo, matches_played, wins, losses, draws, sets_won, sets_lost";
	const [singlesResult, doublesResult, teamsResult] = await Promise.all([
		singlesIds.size ? adminClient.from("player_ratings").select(`player_id, ${fields}`).in("player_id", [...singlesIds]) : Promise.resolve({ data: [], error: null }),
		doublesPlayerIds.size ? adminClient.from("player_double_ratings").select(`player_id, ${fields}`).in("player_id", [...doublesPlayerIds]) : Promise.resolve({ data: [], error: null }),
		teamIds.size ? adminClient.from("double_team_ratings").select(`team_id, ${fields}`).in("team_id", [...teamIds]) : Promise.resolve({ data: [], error: null }),
	]);
	const error = singlesResult.error || doublesResult.error || teamsResult.error;
	if (error) throw new Error(`Failed to load atomic ELO state: ${error.message}`);
	const singles = new Map<string, DatabaseRow>((singlesResult.data ?? []).map((row) => [row.player_id, row]));
	const doubles = new Map<string, DatabaseRow>((doublesResult.data ?? []).map((row) => [row.player_id, row]));
	const teams = new Map<string, DatabaseRow>((teamsResult.data ?? []).map((row) => [row.team_id, row]));
	return [
		...[...singlesIds].map((entityId) => ({ kind: "player_singles" as const, entityId, state: databaseRating(singles.get(entityId)) })),
		...[...doublesPlayerIds].map((entityId) => ({ kind: "player_doubles" as const, entityId, state: databaseRating(doubles.get(entityId)) })),
		...[...teamIds].map((entityId) => ({ kind: "double_team" as const, entityId, state: databaseRating(teams.get(entityId)) })),
	];
}
