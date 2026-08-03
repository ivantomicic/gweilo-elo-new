import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_SINGLES_INACTIVITY_DAYS } from "@/lib/statistics/min-matches";

type RecentSessionRecord = {
	id: string;
};

type RecentSinglesMatchRecord = {
	player_ids: string[] | null;
};

export async function getActiveSinglesPlayerIds(
	adminClient: SupabaseClient,
	now = new Date(),
) {
	const cutoffDate = new Date(
		now.getTime() - MAX_SINGLES_INACTIVITY_DAYS * 24 * 60 * 60 * 1000,
	).toISOString();
	const { data: recentSessions, error: sessionsError } = await adminClient
		.from("sessions")
		.select("id")
		.eq("status", "completed")
		.not("completed_at", "is", null)
		.gte("completed_at", cutoffDate);

	if (sessionsError) {
		throw new Error(
			`Failed to fetch recent completed sessions: ${sessionsError.message}`,
		);
	}

	const sessionIds = ((recentSessions || []) as RecentSessionRecord[]).map(
		(session) => session.id,
	);

	if (sessionIds.length === 0) {
		return new Set<string>();
	}

	const { data: recentSinglesMatches, error: matchesError } = await adminClient
		.from("session_matches")
		.select("player_ids")
		.eq("match_type", "singles")
		.eq("status", "completed")
		.eq("is_rated", true)
		.in("session_id", sessionIds);

	if (matchesError) {
		throw new Error(
			`Failed to fetch recent singles matches: ${matchesError.message}`,
		);
	}

	const activePlayerIds = new Set<string>();
	for (const match of (recentSinglesMatches || []) as RecentSinglesMatchRecord[]) {
		for (const playerId of (match.player_ids || []).slice(0, 2)) {
			if (playerId) activePlayerIds.add(playerId);
		}
	}

	return activePlayerIds;
}
