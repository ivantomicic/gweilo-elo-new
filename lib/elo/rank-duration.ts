import { createAdminClient } from "@/lib/supabase/admin";

export type RankDurationEntityType =
	| "player_singles"
	| "player_doubles"
	| "double_team";

export type RankDurationEntityState = {
	entityId: string;
	elo: number;
};

export type RankDurationResult = {
	days: number;
};

export type RankPlacementTotal = {
	rank: number;
	days: number;
	sessions: number;
};

type CompletedSessionRecord = {
	id: string;
	completed_at: string | null;
};

type SessionSnapshotRecord = {
	session_id: string;
	entity_id: string;
	elo: number | string | null;
	matches_played: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;

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

function getCompletedAtMs(session: CompletedSessionRecord): number | null {
	if (!session.completed_at) {
		return null;
	}

	const completedAtMs = new Date(session.completed_at).getTime();
	return Number.isFinite(completedAtMs) ? completedAtMs : null;
}

function dedupeAndSortSessions(
	sessions: CompletedSessionRecord[]
): CompletedSessionRecord[] {
	const sessionMap = new Map<string, CompletedSessionRecord>();

	for (const session of sessions) {
		if (getCompletedAtMs(session) !== null) {
			sessionMap.set(session.id, session);
		}
	}

	return Array.from(sessionMap.values()).sort((a, b) => {
		return (getCompletedAtMs(b) ?? 0) - (getCompletedAtMs(a) ?? 0);
	});
}

async function getRankDurationSessions(
	adminClient = createAdminClient()
): Promise<CompletedSessionRecord[]> {
	const sessions: CompletedSessionRecord[] = [];
	let from = 0;

	while (true) {
		const { data, error } = await adminClient
			.from("sessions")
			.select("id, completed_at")
			.eq("status", "completed")
			.order("completed_at", { ascending: false })
			.range(from, from + PAGE_SIZE - 1);

		if (error) {
			console.error(
				"[RANK_DURATION] Failed to fetch completed sessions:",
				error
			);
			return [];
		}

		const page = (data || []) as CompletedSessionRecord[];
		sessions.push(...page);

		if (page.length < PAGE_SIZE) {
			break;
		}

		from += PAGE_SIZE;
	}

	return dedupeAndSortSessions(sessions);
}

async function getRankDurationSnapshotRows({
	adminClient = createAdminClient(),
	entityType,
	entityIds = null,
}: {
	adminClient?: ReturnType<typeof createAdminClient>;
	entityType: RankDurationEntityType;
	entityIds?: Set<string> | null;
}): Promise<SessionSnapshotRecord[]> {
	const snapshotRows: SessionSnapshotRecord[] = [];
	const entityIdList = entityIds ? Array.from(entityIds) : null;

	if (entityIdList && entityIdList.length === 0) {
		return snapshotRows;
	}

	let from = 0;
	while (true) {
		let query = adminClient
			.from("session_rating_snapshots")
			.select("session_id, entity_id, elo, matches_played")
			.eq("entity_type", entityType);

		if (entityIdList) {
			query = query.in("entity_id", entityIdList);
		}

		const { data, error } = await query.range(from, from + PAGE_SIZE - 1);

		if (error) {
			console.error(
				"[RANK_DURATION] Failed to fetch session snapshots:",
				error
			);
			return [];
		}

		const page = (data || []) as SessionSnapshotRecord[];
		snapshotRows.push(...page);

		if (page.length < PAGE_SIZE) {
			break;
		}

		from += PAGE_SIZE;
	}

	return snapshotRows;
}

function buildSessionRankings({
	sessions,
	snapshotRows,
	currentEntityIds,
	minMatches,
}: {
	sessions: CompletedSessionRecord[];
	snapshotRows: SessionSnapshotRecord[];
	currentEntityIds: Set<string> | null;
	minMatches: number | null;
}): Map<string, Map<string, number>> {
	const rowsBySession = new Map<string, SessionSnapshotRecord[]>();

	for (const row of snapshotRows) {
		const existingRows = rowsBySession.get(row.session_id) || [];
		existingRows.push(row);
		rowsBySession.set(row.session_id, existingRows);
	}

	const rankingsBySession = new Map<string, Map<string, number>>();

	for (const session of sessions) {
		const rankedEntities = (rowsBySession.get(session.id) || [])
			.filter((row) => {
				if (currentEntityIds && !currentEntityIds.has(row.entity_id)) {
					return false;
				}

				if (minMatches === null) {
					return true;
				}

				return toNumber(row.matches_played) >= minMatches;
			})
			.map((row) => ({
				entityId: row.entity_id,
				elo: toNumber(row.elo, 1500),
			}));

		rankingsBySession.set(session.id, buildRankingMap(rankedEntities));
	}

	return rankingsBySession;
}

export async function computeCurrentRankDurations({
	currentEntities,
	entityType,
	minMatches = null,
	now = new Date(),
}: {
	currentEntities: RankDurationEntityState[];
	entityType: RankDurationEntityType;
	minMatches?: number | null;
	now?: Date;
}): Promise<Map<string, RankDurationResult>> {
	const durations = new Map<string, RankDurationResult>();

	if (currentEntities.length === 0) {
		return durations;
	}

	const currentRanking = buildRankingMap(currentEntities);
	const currentEntityIds = new Set(currentEntities.map((entity) => entity.entityId));
	const adminClient = createAdminClient();
	const sessions = await getRankDurationSessions(adminClient);

	if (sessions.length === 0) {
		return durations;
	}

	const snapshotRows = await getRankDurationSnapshotRows({
		adminClient,
		entityType,
		entityIds: currentEntityIds,
	});

	const rankingsBySession = buildSessionRankings({
		sessions,
		snapshotRows,
		currentEntityIds,
		minMatches,
	});
	const nowMs = now.getTime();

	for (const entity of currentEntities) {
		const currentRank = currentRanking.get(entity.entityId);
		if (!currentRank) {
			continue;
		}

		let startMs: number | null = null;
		let matchedLatestRank = false;
		let foundDifferentRank = false;

		for (const session of sessions) {
			if (foundDifferentRank) {
				break;
			}

			const completedAtMs = getCompletedAtMs(session);
			if (completedAtMs === null) {
				continue;
			}

			const historicalRank = rankingsBySession
				.get(session.id)
				?.get(entity.entityId);

			if (historicalRank === currentRank) {
				matchedLatestRank = true;
				startMs = completedAtMs;
			} else {
				foundDifferentRank = true;
			}
		}

		if (!matchedLatestRank || startMs === null) {
			continue;
		}

		const durationMs = Math.max(0, nowMs - startMs);
		const days = Math.max(1, Math.floor(durationMs / DAY_MS));

		durations.set(entity.entityId, {
			days,
		});
	}

	return durations;
}

export async function computePlayerRankPlacementTotals({
	playerId,
	entityType = "player_singles",
	minMatches = null,
	now = new Date(),
}: {
	playerId: string;
	entityType?: RankDurationEntityType;
	minMatches?: number | null;
	now?: Date;
}): Promise<RankPlacementTotal[]> {
	const adminClient = createAdminClient();
	const sessions = await getRankDurationSessions(adminClient);
	const ascendingSessions = [...sessions].sort((a, b) => {
		return (getCompletedAtMs(a) ?? 0) - (getCompletedAtMs(b) ?? 0);
	});

	if (ascendingSessions.length === 0) {
		return [];
	}

	const snapshotRows = await getRankDurationSnapshotRows({
		adminClient,
		entityType,
	});
	const rankingsBySession = buildSessionRankings({
		sessions: ascendingSessions,
		snapshotRows,
		currentEntityIds: null,
		minMatches,
	});
	const placementTotals = new Map<
		number,
		{
			durationMs: number;
			sessions: number;
		}
	>();
	const nowMs = now.getTime();

	for (let index = 0; index < ascendingSessions.length; index++) {
		const session = ascendingSessions[index];
		const startMs = getCompletedAtMs(session);
		const nextSession = ascendingSessions[index + 1] || null;
		const endMs = nextSession ? getCompletedAtMs(nextSession) : nowMs;
		const rank = rankingsBySession.get(session.id)?.get(playerId);

		if (startMs === null || endMs === null || endMs < startMs || !rank) {
			continue;
		}

		const currentTotal = placementTotals.get(rank) || {
			durationMs: 0,
			sessions: 0,
		};
		currentTotal.durationMs += endMs - startMs;
		currentTotal.sessions += 1;
		placementTotals.set(rank, currentTotal);
	}

	return Array.from(placementTotals.entries())
		.map(([rank, total]) => ({
			rank,
			days: Math.max(1, Math.floor(total.durationMs / DAY_MS)),
			sessions: total.sessions,
		}))
		.sort((a, b) => a.rank - b.rank);
}
