import type { SupabaseClient } from "@supabase/supabase-js";
import type { SixPlayerTeamKey } from "./schedule";

export type CandidateTeams = Record<
	SixPlayerTeamKey,
	[string, string]
>;

const TEAM_ORDER: SixPlayerTeamKey[] = ["A", "B", "C"];

function normalizePair(playerIds: [string, string]): string {
	return [...playerIds].sort().join(":");
}

function countOverlap(
	candidatePair: [string, string],
	recentPairs: Array<[string, string]>,
): number {
	return recentPairs.reduce((total, recentPair) => {
		const recentSet = new Set(recentPair);
		return total + candidatePair.filter((id) => recentSet.has(id)).length;
	}, 0);
}

export function getPreferredRound5SinglesTeam(
	candidateTeams: CandidateTeams,
	recentPairs: Array<[string, string]>,
): SixPlayerTeamKey {
	const mostRecentPair = recentPairs[0] ?? null;

	return (
		TEAM_ORDER.map((teamKey) => {
			const pair = candidateTeams[teamKey];
			const recentSet = mostRecentPair ? new Set(mostRecentPair) : null;
			return {
				teamKey,
				totalOverlap: countOverlap(pair, recentPairs),
				mostRecentOverlap: recentSet
					? pair.filter((id) => recentSet.has(id)).length
					: 0,
				hasExactRecentMatch: recentPairs.some(
					(recentPair) => normalizePair(recentPair) === normalizePair(pair),
				),
			};
		}).sort((a, b) => {
			if (a.totalOverlap !== b.totalOverlap) {
				return a.totalOverlap - b.totalOverlap;
			}
			if (a.mostRecentOverlap !== b.mostRecentOverlap) {
				return a.mostRecentOverlap - b.mostRecentOverlap;
			}
			if (a.hasExactRecentMatch !== b.hasExactRecentMatch) {
				return a.hasExactRecentMatch ? 1 : -1;
			}
			return TEAM_ORDER.indexOf(a.teamKey) - TEAM_ORDER.indexOf(b.teamKey);
		})[0]?.teamKey ?? "C"
	);
}

export async function loadRecentRound5SinglesPairs(
	supabase: SupabaseClient,
	userId: string,
): Promise<Array<[string, string]>> {
	const { data: sessions, error } = await supabase
		.from("sessions")
		.select("id")
		.eq("created_by", userId)
		.eq("player_count", 6)
		.order("created_at", { ascending: false })
		.limit(6);

	if (error) {
		throw error;
	}

	const recentPairs: Array<[string, string]> = [];
	for (const session of sessions || []) {
		const result = await supabase
			.from("session_matches")
			.select("player_ids")
			.eq("session_id", session.id)
			.eq("round_number", 5)
			.eq("match_type", "singles")
			.eq("is_rated", true)
			.limit(1)
			.maybeSingle();

		if (result.error) {
			continue;
		}

		const playerIds = result.data?.player_ids as string[] | undefined;
		if (playerIds?.length === 2) {
			recentPairs.push([playerIds[0], playerIds[1]]);
		}
		if (recentPairs.length >= 2) {
			break;
		}
	}

	return recentPairs;
}
