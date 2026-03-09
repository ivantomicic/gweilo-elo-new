import { createAdminClient } from "@/lib/supabase/admin";

export type RankMovementEntityType =
	| "player_singles"
	| "player_doubles"
	| "double_team";

export type RankedEntityState = {
	entityId: string;
	elo: number;
	matchesPlayed: number;
};

type RankingDeltaState = {
	eloDelta: number;
	sessionMatchesPlayed: number;
};

function sortRankedEntities<T extends { entityId: string; elo: number }>(
	entities: T[]
) {
	return [...entities].sort((a, b) => {
		if (b.elo !== a.elo) {
			return b.elo - a.elo;
		}

		return a.entityId.localeCompare(b.entityId);
	});
}

function buildRankingMap(
	entities: Array<{ entityId: string; elo: number }>
): Map<string, number> {
	const rankingMap = new Map<string, number>();

	sortRankedEntities(entities).forEach((entity, index) => {
		rankingMap.set(entity.entityId, index + 1);
	});

	return rankingMap;
}

function toNumber(value: unknown, fallback = 0): number {
	if (typeof value === "number") {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	}

	return fallback;
}

/**
 * Get the latest two completed sessions ordered by completion time.
 *
 * The latest completed session is the session whose snapshot should power the
 * statistics table. Rank movements are then computed by reversing that latest
 * session's Elo deltas.
 */
export async function getLatestTwoCompletedSessions(): Promise<
	[string | null, string | null]
> {
	const adminClient = createAdminClient();

	const { data: sessions, error } = await adminClient
		.from("sessions")
		.select("id, completed_at")
		.eq("status", "completed")
		.order("completed_at", { ascending: false })
		.limit(2);

	if (error || !sessions || sessions.length === 0) {
		return [null, null];
	}

	return [sessions[0]?.id || null, sessions[1]?.id || null];
}

type SnapshotDeltaInput = {
	currentEntities: RankedEntityState[];
	latestSessionId: string;
	entityType: RankMovementEntityType;
};

async function getPreviousRankingByReversingLatestSession({
	currentEntities,
	latestSessionId,
	entityType,
}: SnapshotDeltaInput): Promise<Map<string, number>> {
	const adminClient = createAdminClient();

	if (currentEntities.length === 0) {
		return new Map();
	}

	const deltaState = new Map<string, RankingDeltaState>();
	for (const entity of currentEntities) {
		deltaState.set(entity.entityId, {
			eloDelta: 0,
			sessionMatchesPlayed: 0,
		});
	}

	if (entityType === "player_singles") {
		const { data: sessionMatches, error: matchesError } = await adminClient
			.from("session_matches")
			.select("id, player_ids")
			.eq("session_id", latestSessionId)
			.eq("status", "completed")
			.eq("match_type", "singles");

		if (matchesError) {
			console.error("[RANK] Failed to fetch latest singles matches:", matchesError);
			return buildRankingMap(currentEntities);
		}

		const matchIds = (sessionMatches || []).map((match) => match.id);
		if (matchIds.length === 0) {
			return buildRankingMap(currentEntities);
		}

		const { data: matchHistory, error: historyError } = await adminClient
			.from("match_elo_history")
			.select(
				"match_id, player1_id, player2_id, player1_elo_delta, player2_elo_delta"
			)
			.in("match_id", matchIds);

		if (historyError) {
			console.error(
				"[RANK] Failed to fetch latest singles match history:",
				historyError
			);
			return buildRankingMap(currentEntities);
		}

		for (const match of sessionMatches || []) {
			const playerIds = (match.player_ids as string[]) || [];
			for (const playerId of playerIds.slice(0, 2)) {
				const state = deltaState.get(playerId);
				if (state) {
					state.sessionMatchesPlayed += 1;
				}
			}
		}

		for (const historyEntry of matchHistory || []) {
			const player1State = historyEntry.player1_id
				? deltaState.get(historyEntry.player1_id)
				: null;
			const player2State = historyEntry.player2_id
				? deltaState.get(historyEntry.player2_id)
				: null;

			if (player1State) {
				player1State.eloDelta += toNumber(historyEntry.player1_elo_delta);
			}

			if (player2State) {
				player2State.eloDelta += toNumber(historyEntry.player2_elo_delta);
			}
		}
	} else if (entityType === "player_doubles") {
		const { data: sessionMatches, error: matchesError } = await adminClient
			.from("session_matches")
			.select("id, player_ids")
			.eq("session_id", latestSessionId)
			.eq("status", "completed")
			.eq("match_type", "doubles");

		if (matchesError) {
			console.error("[RANK] Failed to fetch latest doubles matches:", matchesError);
			return buildRankingMap(currentEntities);
		}

		const matchIds = (sessionMatches || []).map((match) => match.id);
		if (matchIds.length === 0) {
			return buildRankingMap(currentEntities);
		}

		const { data: matchHistory, error: historyError } = await adminClient
			.from("match_elo_history")
			.select("match_id, team1_elo_delta, team2_elo_delta")
			.in("match_id", matchIds);

		if (historyError) {
			console.error(
				"[RANK] Failed to fetch latest doubles match history:",
				historyError
			);
			return buildRankingMap(currentEntities);
		}

		const historyMap = new Map(
			(matchHistory || []).map((entry) => [entry.match_id, entry])
		);

		for (const match of sessionMatches || []) {
			const playerIds = (match.player_ids as string[]) || [];
			if (playerIds.length < 4) {
				continue;
			}

			for (const playerId of playerIds) {
				const state = deltaState.get(playerId);
				if (state) {
					state.sessionMatchesPlayed += 1;
				}
			}

			const historyEntry = historyMap.get(match.id);
			if (!historyEntry) {
				continue;
			}

			const team1Delta = toNumber(historyEntry.team1_elo_delta);
			const team2Delta = toNumber(historyEntry.team2_elo_delta);

			for (const playerId of playerIds.slice(0, 2)) {
				const state = deltaState.get(playerId);
				if (state) {
					state.eloDelta += team1Delta;
				}
			}

			for (const playerId of playerIds.slice(2, 4)) {
				const state = deltaState.get(playerId);
				if (state) {
					state.eloDelta += team2Delta;
				}
			}
		}
	} else {
		const { data: sessionMatches, error: matchesError } = await adminClient
			.from("session_matches")
			.select("id, team_1_id, team_2_id")
			.eq("session_id", latestSessionId)
			.eq("status", "completed")
			.eq("match_type", "doubles");

		if (matchesError) {
			console.error(
				"[RANK] Failed to fetch latest doubles team matches:",
				matchesError
			);
			return buildRankingMap(currentEntities);
		}

		for (const match of sessionMatches || []) {
			for (const teamId of [match.team_1_id, match.team_2_id]) {
				if (!teamId) {
					continue;
				}

				const state = deltaState.get(teamId);
				if (state) {
					state.sessionMatchesPlayed += 1;
				}
			}
		}

		const matchIds = (sessionMatches || []).map((match) => match.id);

		if (matchIds.length === 0) {
			return buildRankingMap(currentEntities);
		}

		const { data: matchHistory, error: historyError } = await adminClient
			.from("match_elo_history")
			.select("team1_id, team2_id, team1_elo_delta, team2_elo_delta")
			.in("match_id", matchIds);

		if (historyError) {
			console.error(
				"[RANK] Failed to fetch latest doubles team history:",
				historyError
			);
			return buildRankingMap(currentEntities);
		}

		for (const historyEntry of matchHistory || []) {
			if (historyEntry.team1_id) {
				const team1State = deltaState.get(historyEntry.team1_id);
				if (team1State) {
					team1State.eloDelta += toNumber(historyEntry.team1_elo_delta);
				}
			}

			if (historyEntry.team2_id) {
				const team2State = deltaState.get(historyEntry.team2_id);
				if (team2State) {
					team2State.eloDelta += toNumber(historyEntry.team2_elo_delta);
				}
			}
		}
	}

	const previousEntities = currentEntities
		.map((entity) => {
			const delta = deltaState.get(entity.entityId) ?? {
				eloDelta: 0,
				sessionMatchesPlayed: 0,
			};

			const previousMatchesPlayed = Math.max(
				0,
				entity.matchesPlayed - delta.sessionMatchesPlayed
			);
			const existedBeforeLatestSession =
				delta.sessionMatchesPlayed === 0 || previousMatchesPlayed > 0;

			if (!existedBeforeLatestSession) {
				return null;
			}

			return {
				entityId: entity.entityId,
				elo: entity.elo - delta.eloDelta,
			};
		})
		.filter(
			(
				entity
			): entity is {
				entityId: string;
				elo: number;
			} => entity !== null
		);

	return buildRankingMap(previousEntities);
}

/**
 * Compute rank movements for the statistics table.
 *
 * The current ranking is the latest completed session snapshot. The previous
 * ranking is reconstructed by reversing the latest completed session's Elo
 * deltas, which makes the arrows correct even if older session snapshots were
 * never backfilled.
 */
export async function computeRankMovements(
	currentEntities: RankedEntityState[],
	latestSessionId: string | null,
	entityType: RankMovementEntityType
): Promise<Map<string, number>> {
	const movements = new Map<string, number>();

	if (!latestSessionId || currentEntities.length === 0) {
		return movements;
	}

	const currentRanking = buildRankingMap(currentEntities);
	const previousRanking = await getPreviousRankingByReversingLatestSession({
		currentEntities,
		latestSessionId,
		entityType,
	});

	for (const entity of currentEntities) {
		const currentRank = currentRanking.get(entity.entityId);
		const previousRank = previousRanking.get(entity.entityId);

		if (!currentRank || previousRank === undefined) {
			movements.set(entity.entityId, 0);
			continue;
		}

		movements.set(entity.entityId, previousRank - currentRank);
	}

	return movements;
}
