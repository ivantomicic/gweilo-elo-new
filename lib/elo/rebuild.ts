import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateDoubleTeam } from "@/lib/elo/double-teams";
import {
	captureCompletedSessionSnapshots,
	createEloSnapshots,
} from "@/lib/elo/snapshots";
import { updateDoublesRatings, updateSinglesRatings } from "@/lib/elo/updates";

type AdminClient = ReturnType<typeof createAdminClient>;

type RebuildableSession = {
	id: string;
	created_at: string;
};

type RebuildableMatch = {
	id: string;
	match_type: "singles" | "doubles";
	player_ids: string[] | null;
	team1_score: number | null;
	team2_score: number | null;
	team_1_id: string | null;
	team_2_id: string | null;
	round_number: number;
	match_order: number;
};

export type RebuildAllEloDataOptions = {
	adminClient?: AdminClient;
	triggeredBy?: string | null;
	reason?: string;
};

export type RebuildAllEloDataResult = {
	sessionsReplayed: number;
	matchesReplayed: number;
	skippedMatches: number;
	skippedMatchIds: string[];
	totalPlayerRatings: number;
	totalPlayerDoublesRatings: number;
	totalTeamDoublesRatings: number;
	sessionIds: string[];
};

async function clearAllEloDerivedData(adminClient: AdminClient) {
	const clearOperations = [
		adminClient.from("match_elo_history").delete().not("match_id", "is", null),
		adminClient.from("elo_snapshots").delete().not("match_id", "is", null),
		adminClient
			.from("session_rating_snapshots")
			.delete()
			.not("session_id", "is", null),
		adminClient.from("player_ratings").delete().not("player_id", "is", null),
		adminClient
			.from("player_double_ratings")
			.delete()
			.not("player_id", "is", null),
		adminClient
			.from("double_team_ratings")
			.delete()
			.not("team_id", "is", null),
	] as const;

	const results = await Promise.all(clearOperations);
	const errors = results.map((result) => result.error).filter(Boolean);

	if (errors.length > 0) {
		throw new Error(
			`Failed to clear Elo rebuild tables: ${errors
				.map((error) => error?.message)
				.join(" | ")}`
		);
	}
}

async function replaySinglesMatch(
	adminClient: AdminClient,
	match: RebuildableMatch,
	sessionCreatedAt: string
) {
	const playerIds = (match.player_ids as string[]) || [];
	if (
		playerIds.length < 2 ||
		match.team1_score === null ||
		match.team2_score === null
	) {
		return { skipped: true as const };
	}

	const { data: rating1Before } = await adminClient
		.from("player_ratings")
		.select("elo")
		.eq("player_id", playerIds[0])
		.maybeSingle();
	const { data: rating2Before } = await adminClient
		.from("player_ratings")
		.select("elo")
		.eq("player_id", playerIds[1])
		.maybeSingle();

	const player1EloBefore = rating1Before?.elo ?? 1500;
	const player2EloBefore = rating2Before?.elo ?? 1500;

	await updateSinglesRatings(
		playerIds[0],
		playerIds[1],
		match.team1_score,
		match.team2_score
	);

	const { data: rating1After } = await adminClient
		.from("player_ratings")
		.select("elo")
		.eq("player_id", playerIds[0])
		.maybeSingle();
	const { data: rating2After } = await adminClient
		.from("player_ratings")
		.select("elo")
		.eq("player_id", playerIds[1])
		.maybeSingle();

	const player1EloAfter = rating1After?.elo ?? player1EloBefore;
	const player2EloAfter = rating2After?.elo ?? player2EloBefore;

	await createEloSnapshots(match.id, playerIds, "singles");

	return {
		skipped: false as const,
		historyEntry: {
			match_id: match.id,
			player1_id: playerIds[0],
			player2_id: playerIds[1],
			player1_elo_before: player1EloBefore,
			player1_elo_after: player1EloAfter,
			player1_elo_delta: player1EloAfter - player1EloBefore,
			player2_elo_before: player2EloBefore,
			player2_elo_after: player2EloAfter,
			player2_elo_delta: player2EloAfter - player2EloBefore,
			created_at: sessionCreatedAt,
		},
	};
}

async function replayDoublesMatch(
	adminClient: AdminClient,
	match: RebuildableMatch,
	sessionCreatedAt: string
) {
	const playerIds = (match.player_ids as string[]) || [];
	if (
		playerIds.length < 4 ||
		match.team1_score === null ||
		match.team2_score === null
	) {
		return { skipped: true as const };
	}

	const team1Id =
		match.team_1_id ?? (await getOrCreateDoubleTeam(playerIds[0], playerIds[1]));
	const team2Id =
		match.team_2_id ?? (await getOrCreateDoubleTeam(playerIds[2], playerIds[3]));

	if (match.team_1_id !== team1Id || match.team_2_id !== team2Id) {
		const { error: updateMatchError } = await adminClient
			.from("session_matches")
			.update({
				team_1_id: team1Id,
				team_2_id: team2Id,
			})
			.eq("id", match.id);

		if (updateMatchError) {
			throw new Error(
				`Failed to repair doubles team IDs for match ${match.id}: ${updateMatchError.message}`
			);
		}
	}

	const { data: team1RatingBefore } = await adminClient
		.from("double_team_ratings")
		.select("elo")
		.eq("team_id", team1Id)
		.maybeSingle();
	const { data: team2RatingBefore } = await adminClient
		.from("double_team_ratings")
		.select("elo")
		.eq("team_id", team2Id)
		.maybeSingle();

	const team1EloBefore = team1RatingBefore?.elo ?? 1500;
	const team2EloBefore = team2RatingBefore?.elo ?? 1500;

	await updateDoublesRatings(
		[playerIds[0], playerIds[1]],
		[playerIds[2], playerIds[3]],
		match.team1_score,
		match.team2_score
	);

	const { data: team1RatingAfter } = await adminClient
		.from("double_team_ratings")
		.select("elo")
		.eq("team_id", team1Id)
		.maybeSingle();
	const { data: team2RatingAfter } = await adminClient
		.from("double_team_ratings")
		.select("elo")
		.eq("team_id", team2Id)
		.maybeSingle();

	const team1EloAfter = team1RatingAfter?.elo ?? team1EloBefore;
	const team2EloAfter = team2RatingAfter?.elo ?? team2EloBefore;

	await createEloSnapshots(match.id, playerIds, "doubles");

	return {
		skipped: false as const,
		historyEntry: {
			match_id: match.id,
			team1_id: team1Id,
			team2_id: team2Id,
			team1_elo_before: team1EloBefore,
			team1_elo_after: team1EloAfter,
			team1_elo_delta: team1EloAfter - team1EloBefore,
			team2_elo_before: team2EloBefore,
			team2_elo_after: team2EloAfter,
			team2_elo_delta: team2EloAfter - team2EloBefore,
			created_at: sessionCreatedAt,
		},
	};
}

export async function rebuildAllEloData({
	adminClient = createAdminClient(),
	triggeredBy = null,
	reason = "manual",
}: RebuildAllEloDataOptions = {}): Promise<RebuildAllEloDataResult> {
	await clearAllEloDerivedData(adminClient);

	const { data: sessions, error: sessionsError } = await adminClient
		.from("sessions")
		.select("id, created_at")
		.eq("status", "completed")
		.order("created_at", { ascending: true });

	if (sessionsError) {
		throw new Error(
			`Failed to fetch completed sessions for Elo rebuild: ${sessionsError.message}`
		);
	}

	const completedSessions = (sessions || []) as RebuildableSession[];
	const skippedMatchIds: string[] = [];
	let matchesReplayed = 0;

	console.log(
		JSON.stringify({
			tag: "[ELO_REBUILD]",
			action: "START",
			reason,
			triggered_by: triggeredBy,
			sessions_to_replay: completedSessions.length,
			session_ids: completedSessions.map((session) => session.id),
		})
	);

	for (const session of completedSessions) {
		const { data: sessionMatches, error: matchesError } = await adminClient
			.from("session_matches")
			.select(
				"id, match_type, player_ids, team1_score, team2_score, team_1_id, team_2_id, round_number, match_order"
			)
			.eq("session_id", session.id)
			.eq("status", "completed")
			.order("round_number", { ascending: true })
			.order("match_order", { ascending: true });

		if (matchesError) {
			throw new Error(
				`Failed to fetch matches for session ${session.id}: ${matchesError.message}`
			);
		}

		const eloHistoryEntries: Array<Record<string, unknown>> = [];

		for (const match of (sessionMatches || []) as RebuildableMatch[]) {
			let replayResult:
				| { skipped: true }
				| { skipped: false; historyEntry: Record<string, unknown> };

			if (match.match_type === "singles") {
				replayResult = await replaySinglesMatch(
					adminClient,
					match,
					session.created_at
				);
			} else {
				replayResult = await replayDoublesMatch(
					adminClient,
					match,
					session.created_at
				);
			}

			if (replayResult.skipped) {
				skippedMatchIds.push(match.id);
				console.warn(
					JSON.stringify({
						tag: "[ELO_REBUILD]",
						action: "SKIP_MATCH",
						session_id: session.id,
						match_id: match.id,
						match_type: match.match_type,
						reason: "Missing scores or players",
					})
				);
				continue;
			}

			eloHistoryEntries.push(replayResult.historyEntry);
			matchesReplayed += 1;
		}

		if (eloHistoryEntries.length > 0) {
			const { error: historyError } = await adminClient
				.from("match_elo_history")
				.insert(eloHistoryEntries);

			if (historyError) {
				throw new Error(
					`Failed to insert match Elo history for session ${session.id}: ${historyError.message}`
				);
			}
		}

		await captureCompletedSessionSnapshots(session.id, adminClient);
	}

	const [
		{ count: totalPlayerRatings, error: playerRatingsError },
		{ count: totalPlayerDoublesRatings, error: playerDoublesError },
		{ count: totalTeamDoublesRatings, error: teamDoublesError },
	] = await Promise.all([
		adminClient.from("player_ratings").select("*", { count: "exact", head: true }),
		adminClient
			.from("player_double_ratings")
			.select("*", { count: "exact", head: true }),
		adminClient
			.from("double_team_ratings")
			.select("*", { count: "exact", head: true }),
	]);

	if (playerRatingsError || playerDoublesError || teamDoublesError) {
		throw new Error(
			[
				playerRatingsError?.message,
				playerDoublesError?.message,
				teamDoublesError?.message,
			]
				.filter(Boolean)
				.join(" | ")
		);
	}

	const result = {
		sessionsReplayed: completedSessions.length,
		matchesReplayed,
		skippedMatches: skippedMatchIds.length,
		skippedMatchIds,
		totalPlayerRatings: totalPlayerRatings || 0,
		totalPlayerDoublesRatings: totalPlayerDoublesRatings || 0,
		totalTeamDoublesRatings: totalTeamDoublesRatings || 0,
		sessionIds: completedSessions.map((session) => session.id),
	};

	console.log(
		JSON.stringify({
			tag: "[ELO_REBUILD]",
			action: "COMPLETE",
			reason,
			triggered_by: triggeredBy,
			...result,
		})
	);

	return result;
}
