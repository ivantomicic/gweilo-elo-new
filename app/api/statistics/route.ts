import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
	getLatestTwoCompletedSessions,
	computeRankMovements,
} from "@/lib/elo/rank-movements";
import { computeCurrentRankDurations } from "@/lib/elo/rank-duration";
import {
	createAdminClient,
	listAllAuthUsers,
	verifyUser,
} from "@/lib/supabase/admin";
import { isRankedPlayerAccount } from "@/lib/auth/roles";
import {
	MAX_DOUBLES_PLAYER_INACTIVITY_DAYS,
	MAX_DOUBLES_TEAM_INACTIVITY_DAYS,
	MIN_DOUBLES_PLAYER_MATCHES,
	MIN_DOUBLES_TEAM_MATCHES,
	MIN_SINGLES_MATCHES,
} from "@/lib/statistics/min-matches";
import { getActiveSinglesPlayerIds } from "@/lib/statistics/active-singles";
import {
	isDoublesTeamRankingEligible,
	isPlayerRankingEligible,
	STATISTICS_ELIGIBILITY,
} from "@/lib/statistics/eligibility";

export const dynamic = "force-dynamic";

const STATISTICS_REVALIDATE_SECONDS = 60;

type ViewMode = "all" | "singles" | "doubles_player" | "doubles_team";

type ProfileRecord = {
	id: string;
	display_name: string | null;
	avatar_url: string | null;
};

type SinglesRatingRecord = {
	player_id: string;
	matches_played: number | null;
	wins: number | null;
	losses: number | null;
	draws: number | null;
	sets_won: number | null;
	sets_lost: number | null;
	elo: number | null;
};

type DoublesPlayerRatingRecord = SinglesRatingRecord;

type DoubleTeamRecord = {
	id: string;
	player_1_id: string;
	player_2_id: string;
};

type DoublesTeamRatingRecord = {
	team_id: string;
	matches_played: number | null;
	wins: number | null;
	losses: number | null;
	draws: number | null;
	sets_won: number | null;
	sets_lost: number | null;
	elo: number | null;
};

type PlayerStats = {
	player_id: string;
	display_name: string;
	avatar: string | null;
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
	sets_won: number;
	sets_lost: number;
	elo: number;
	rank_movement: number;
	rank_duration_days: number | null;
	rank_duration_capped: boolean;
	recent_form: number[];
};

type TeamStats = {
	team_id: string;
	player1: {
		id: string;
		display_name: string;
		avatar: string | null;
	};
	player2: {
		id: string;
		display_name: string;
		avatar: string | null;
	};
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
	sets_won: number;
	sets_lost: number;
	elo: number;
	rank_movement: number;
	rank_duration_days: number | null;
	rank_duration_capped: boolean;
	recent_form: number[];
};

type FormSessionRecord = {
	id: string;
	created_at: string;
	completed_at: string | null;
};

type FormMatchRecord = {
	id: string;
	session_id: string;
	match_type: "singles" | "doubles";
	round_number: number;
	match_order: number;
	player_ids: string[] | null;
	team_1_id: string | null;
	team_2_id: string | null;
};

type FormHistoryRecord = {
	match_id: string;
	player1_id: string | null;
	player2_id: string | null;
	player1_elo_delta: number | string | null;
	player2_elo_delta: number | string | null;
	team1_id: string | null;
	team2_id: string | null;
	team1_elo_delta: number | string | null;
	team2_elo_delta: number | string | null;
};

type FormSnapshotRecord = {
	match_id: string;
	player_id: string;
	elo: number | string | null;
	matches_played: number | null;
};

type RecentFormMaps = {
	singles: Record<string, number[]>;
	doublesPlayers: Record<string, number[]>;
	doublesTeams: Record<string, number[]>;
};

type SessionSnapshotRecord = {
	entity_id: string;
	matches_played: number | null;
	wins: number | null;
	losses: number | null;
	draws: number | null;
	sets_won: number | null;
	sets_lost: number | null;
	elo: number | string | null;
};

type RecentSessionRecord = {
	id: string;
};

type RecentDoublesTeamMatchRecord = {
	team_1_id: string | null;
	team_2_id: string | null;
};

type RecentDoublesPlayerMatchRecord = {
	player_ids: string[] | null;
};

function buildProfilesMap(profiles: ProfileRecord[]) {
	return new Map(
		profiles.map((profile) => [
			profile.id,
			{
				display_name: profile.display_name || "User",
				avatar: profile.avatar_url || null,
			},
		])
	);
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

function addSessionDelta(
	target: Map<string, Map<string, number>>,
	entityId: string | null,
	sessionId: string,
	delta: unknown,
) {
	if (!entityId) return;
	const numericDelta = toNumber(delta, Number.NaN);
	if (!Number.isFinite(numericDelta)) return;

	const sessions = target.get(entityId) ?? new Map<string, number>();
	sessions.set(sessionId, (sessions.get(sessionId) ?? 0) + numericDelta);
	target.set(entityId, sessions);
}

function finalizeRecentForm(
	deltas: Map<string, Map<string, number>>,
	sessionOrder: Map<string, number>,
) {
	const result: Record<string, number[]> = {};

	for (const [entityId, sessions] of deltas) {
		const recent = Array.from(sessions.entries())
			.sort(
				([leftSessionId], [rightSessionId]) =>
					(sessionOrder.get(leftSessionId) ?? 0) -
					(sessionOrder.get(rightSessionId) ?? 0),
			)
			.slice(-5)
			.map(([, delta]) => Math.round((delta + Number.EPSILON) * 100) / 100);

		result[entityId] = recent;
	}

	return result;
}

const getCachedRecentFormMaps = unstable_cache(
	async (): Promise<RecentFormMaps> => {
		const adminClient = createAdminClient();
		const [sessionsResult, matchesResult, historyResult, snapshotsResult] =
			await Promise.all([
				adminClient
					.from("sessions")
					.select("id, created_at, completed_at")
					.eq("status", "completed")
					.order("created_at", { ascending: true }),
				adminClient
					.from("session_matches")
					.select(
						"id, session_id, match_type, round_number, match_order, player_ids, team_1_id, team_2_id",
					)
					.eq("status", "completed"),
				adminClient
					.from("match_elo_history")
					.select(
						"match_id, player1_id, player2_id, player1_elo_delta, player2_elo_delta, team1_id, team2_id, team1_elo_delta, team2_elo_delta",
					),
				adminClient
					.from("elo_snapshots")
					.select("match_id, player_id, elo, matches_played"),
			]);

		if (sessionsResult.error) throw sessionsResult.error;
		if (matchesResult.error) throw matchesResult.error;
		if (historyResult.error) throw historyResult.error;
		if (snapshotsResult.error) throw snapshotsResult.error;

		const sessions = (sessionsResult.data || []) as FormSessionRecord[];
		const completedSessionIds = new Set(sessions.map((session) => session.id));
		const matches = ((matchesResult.data || []) as FormMatchRecord[]).filter(
			(match) => completedSessionIds.has(match.session_id),
		);
		const matchMap = new Map(matches.map((match) => [match.id, match]));
		const sessionOrder = new Map(
			sessions.map((session, index) => [session.id, index]),
		);

		const singlesDeltas = new Map<string, Map<string, number>>();
		const doublesTeamDeltas = new Map<string, Map<string, number>>();

		for (const history of (historyResult.data || []) as FormHistoryRecord[]) {
			const match = matchMap.get(history.match_id);
			if (!match) continue;

			if (match.match_type === "singles") {
				addSessionDelta(
					singlesDeltas,
					history.player1_id,
					match.session_id,
					history.player1_elo_delta,
				);
				addSessionDelta(
					singlesDeltas,
					history.player2_id,
					match.session_id,
					history.player2_elo_delta,
				);
			} else {
				addSessionDelta(
					doublesTeamDeltas,
					history.team1_id,
					match.session_id,
					history.team1_elo_delta,
				);
				addSessionDelta(
					doublesTeamDeltas,
					history.team2_id,
					match.session_id,
					history.team2_elo_delta,
				);
			}
		}

		const orderedDoublesSnapshots = (
			(snapshotsResult.data || []) as FormSnapshotRecord[]
		)
			.filter((snapshot) => matchMap.get(snapshot.match_id)?.match_type === "doubles")
			.sort((left, right) => {
				const leftMatch = matchMap.get(left.match_id)!;
				const rightMatch = matchMap.get(right.match_id)!;
				const sessionDifference =
					(sessionOrder.get(leftMatch.session_id) ?? 0) -
					(sessionOrder.get(rightMatch.session_id) ?? 0);
				if (sessionDifference !== 0) return sessionDifference;
				if (leftMatch.round_number !== rightMatch.round_number) {
					return leftMatch.round_number - rightMatch.round_number;
				}
				return leftMatch.match_order - rightMatch.match_order;
			});

		const doublesPlayerDeltas = new Map<string, Map<string, number>>();
		const previousPlayerElo = new Map<string, number>();
		const unknownBaselineSession = new Map<string, string>();

		for (const snapshot of orderedDoublesSnapshots) {
			const match = matchMap.get(snapshot.match_id);
			if (!match) continue;

			const eloAfter = toNumber(snapshot.elo, Number.NaN);
			if (!Number.isFinite(eloAfter)) continue;

			const previousElo = previousPlayerElo.get(snapshot.player_id);
			const canUseInitialBaseline =
				previousElo === undefined && (snapshot.matches_played ?? 0) <= 1;
			if (previousElo === undefined && !canUseInitialBaseline) {
				unknownBaselineSession.set(snapshot.player_id, match.session_id);
			}

			const baselineUnknownForThisSession =
				unknownBaselineSession.get(snapshot.player_id) === match.session_id;
			if (
				(previousElo !== undefined || canUseInitialBaseline) &&
				!baselineUnknownForThisSession
			) {
				addSessionDelta(
					doublesPlayerDeltas,
					snapshot.player_id,
					match.session_id,
					eloAfter - (previousElo ?? 1500),
				);
			}
			previousPlayerElo.set(snapshot.player_id, eloAfter);
			if (
				unknownBaselineSession.has(snapshot.player_id) &&
				unknownBaselineSession.get(snapshot.player_id) !== match.session_id
			) {
				unknownBaselineSession.delete(snapshot.player_id);
			}
		}

		return {
			singles: finalizeRecentForm(singlesDeltas, sessionOrder),
			doublesPlayers: finalizeRecentForm(doublesPlayerDeltas, sessionOrder),
			doublesTeams: finalizeRecentForm(doublesTeamDeltas, sessionOrder),
		};
	},
	["statistics-recent-session-form-v1"],
	{ revalidate: STATISTICS_REVALIDATE_SECONDS, tags: ["statistics"] },
);

function jsonNoStore(body: unknown, init?: ResponseInit) {
	return NextResponse.json(body, {
		...init,
		headers: {
			"Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
			...init?.headers,
		},
	});
}

async function getSessionSnapshotRows(
	sessionId: string,
	entityType: "player_singles" | "player_doubles" | "double_team"
): Promise<SessionSnapshotRecord[]> {
	const adminClient = createAdminClient();
	const { data, error } = await adminClient
		.from("session_rating_snapshots")
		.select(
			"entity_id, matches_played, wins, losses, draws, sets_won, sets_lost, elo"
		)
		.eq("session_id", sessionId)
		.eq("entity_type", entityType)
		.order("elo", { ascending: false });

	if (error) {
		console.error(
			`Error fetching ${entityType} session snapshot rows for ${sessionId}:`,
			error
		);
		return [];
	}

	return (data || []) as SessionSnapshotRecord[];
}

const getCachedProfiles = unstable_cache(
	async (): Promise<ProfileRecord[]> => {
		const adminClient = createAdminClient();
		const { data, error } = await adminClient
			.from("profiles")
			.select("id, display_name, avatar_url");

		if (error) {
			console.error("Error fetching profiles:", error);
			throw new Error("Failed to fetch user details");
		}

		return (data || []) as ProfileRecord[];
	},
	["statistics-profiles"],
	{ revalidate: STATISTICS_REVALIDATE_SECONDS, tags: ["statistics"] }
);

const getCachedDoubleTeams = unstable_cache(
	async (): Promise<DoubleTeamRecord[]> => {
		const adminClient = createAdminClient();
		const { data, error } = await adminClient
			.from("double_teams")
			.select("id, player_1_id, player_2_id");

		if (error) {
			console.error("Error fetching teams:", error);
			throw new Error("Failed to fetch teams");
		}

		return (data || []) as DoubleTeamRecord[];
	},
	["statistics-double-teams"],
	{ revalidate: STATISTICS_REVALIDATE_SECONDS, tags: ["statistics"] }
);

async function getLatestCompletedSessionsFresh() {
	return getLatestTwoCompletedSessions();
}

async function getActiveSinglesPlayerIdsFresh(): Promise<string[]> {
	return Array.from(
		await getActiveSinglesPlayerIds(createAdminClient()),
	);
}

async function getActiveDoublesTeamIdsFresh(): Promise<string[]> {
		const adminClient = createAdminClient();
		const cutoffDate = new Date(
			Date.now() - MAX_DOUBLES_TEAM_INACTIVITY_DAYS * 24 * 60 * 60 * 1000
		).toISOString();

		const { data: recentSessions, error: sessionsError } = await adminClient
			.from("sessions")
			.select("id")
			.eq("status", "completed")
			.gte("completed_at", cutoffDate);

		if (sessionsError) {
			console.error(
				"Error fetching recent completed sessions for doubles team activity:",
				sessionsError
			);
			throw new Error("Failed to fetch doubles team activity");
		}

		const sessionIds = ((recentSessions || []) as RecentSessionRecord[]).map(
			(session) => session.id
		);

		if (sessionIds.length === 0) {
			return [];
		}

		const { data: recentDoublesMatches, error: matchesError } =
			await adminClient
				.from("session_matches")
				.select("team_1_id, team_2_id")
				.eq("match_type", "doubles")
				.eq("status", "completed")
				.in("session_id", sessionIds);

		if (matchesError) {
			console.error(
				"Error fetching recent doubles matches for team activity filter:",
				matchesError
			);
			throw new Error("Failed to fetch doubles team activity");
		}

		const activeTeamIds = new Set<string>();
		for (const match of (recentDoublesMatches || []) as RecentDoublesTeamMatchRecord[]) {
			for (const teamId of [match.team_1_id, match.team_2_id]) {
				if (teamId) {
					activeTeamIds.add(teamId);
				}
			}
		}

		return Array.from(activeTeamIds);
}

async function getActiveDoublesPlayerIdsFresh(): Promise<string[]> {
		const adminClient = createAdminClient();
		const cutoffDate = new Date(
			Date.now() - MAX_DOUBLES_PLAYER_INACTIVITY_DAYS * 24 * 60 * 60 * 1000
		).toISOString();

		const { data: recentSessions, error: sessionsError } = await adminClient
			.from("sessions")
			.select("id")
			.eq("status", "completed")
			.gte("completed_at", cutoffDate);

		if (sessionsError) {
			console.error(
				"Error fetching recent completed sessions for doubles player activity:",
				sessionsError
			);
			throw new Error("Failed to fetch doubles player activity");
		}

		const sessionIds = ((recentSessions || []) as RecentSessionRecord[]).map(
			(session) => session.id
		);

		if (sessionIds.length === 0) {
			return [];
		}

		const { data: recentDoublesMatches, error: matchesError } =
			await adminClient
				.from("session_matches")
				.select("player_ids")
				.eq("match_type", "doubles")
				.eq("status", "completed")
				.in("session_id", sessionIds);

		if (matchesError) {
			console.error(
				"Error fetching recent doubles matches for player activity filter:",
				matchesError
			);
			throw new Error("Failed to fetch doubles player activity");
		}

		const activePlayerIds = new Set<string>();
		for (const match of (recentDoublesMatches || []) as RecentDoublesPlayerMatchRecord[]) {
			const playerIds = (match.player_ids as string[] | null) || [];
			for (const playerId of playerIds) {
				if (playerId) {
					activePlayerIds.add(playerId);
				}
			}
		}

		return Array.from(activePlayerIds);
}

async function getFreshSinglesStats(
	rankedPlayerIds: ReadonlySet<string>,
): Promise<PlayerStats[]> {
		const adminClient = createAdminClient();

		const [
			ratingsResult,
			profiles,
			[latestSessionId],
			activeSinglesPlayerIds,
			recentForms,
		] =
			await Promise.all([
				adminClient
					.from("player_ratings")
					.select(
						"player_id, matches_played, wins, losses, draws, sets_won, sets_lost, elo"
					)
					.order("elo", { ascending: false }),
				getCachedProfiles(),
				getLatestCompletedSessionsFresh(),
				getActiveSinglesPlayerIdsFresh(),
				getCachedRecentFormMaps(),
			]);

		if (ratingsResult.error) {
			console.error("Error fetching singles ratings:", ratingsResult.error);
			throw new Error("Failed to fetch singles ratings");
		}

		const profilesMap = buildProfilesMap(profiles);
		const snapshotRows = latestSessionId
			? await getSessionSnapshotRows(latestSessionId, "player_singles")
			: [];
		const sourceRows =
			snapshotRows.length > 0
				? snapshotRows.map((row) => ({
						player_id: row.entity_id,
						matches_played: row.matches_played,
						wins: row.wins,
						losses: row.losses,
						draws: row.draws,
						sets_won: row.sets_won,
						sets_lost: row.sets_lost,
						elo: toNumber(row.elo, 1500),
					}))
				: ((ratingsResult.data || []) as SinglesRatingRecord[]);

		const activeSinglesPlayerSet = new Set(activeSinglesPlayerIds);
		const singlesStats = sourceRows
			.filter(
				(rating) =>
					isPlayerRankingEligible({
						playerId: rating.player_id,
						matchesPlayed: rating.matches_played,
						activePlayerIds: activeSinglesPlayerSet,
						rankedPlayerIds,
						minimumMatches: MIN_SINGLES_MATCHES,
					}),
			)
			.map((rating): PlayerStats => {
				const profile = profilesMap.get(rating.player_id);
				return {
					player_id: rating.player_id,
					display_name: profile?.display_name || "User",
					avatar: profile?.avatar || null,
					matches_played: rating.matches_played ?? 0,
					wins: rating.wins ?? 0,
					losses: rating.losses ?? 0,
					draws: rating.draws ?? 0,
					sets_won: rating.sets_won ?? 0,
					sets_lost: rating.sets_lost ?? 0,
					elo: toNumber(rating.elo, 1500),
					rank_movement: 0,
					rank_duration_days: null,
					rank_duration_capped: false,
					recent_form: recentForms.singles[rating.player_id] ?? [],
				};
			});

		if (latestSessionId) {
			const rankMovements = await computeRankMovements(
				singlesStats.map((stat) => ({
					entityId: stat.player_id,
					elo: stat.elo,
					matchesPlayed: stat.matches_played,
				})),
				latestSessionId,
				"player_singles"
			);

			singlesStats.forEach((stat) => {
				stat.rank_movement = rankMovements.get(stat.player_id) ?? 0;
			});
		}

		const rankDurations = await computeCurrentRankDurations({
			currentEntities: singlesStats.map((stat) => ({
				entityId: stat.player_id,
				elo: stat.elo,
			})),
			entityType: "player_singles",
			minMatches: MIN_SINGLES_MATCHES,
		});

		singlesStats.forEach((stat) => {
			const rankDuration = rankDurations.get(stat.player_id);
			if (!rankDuration) {
				return;
			}

			stat.rank_duration_days = rankDuration.days;
			stat.rank_duration_capped = false;
		});

		return singlesStats;
}

async function getFreshDoublesPlayerStats(
	rankedPlayerIds: ReadonlySet<string>,
): Promise<PlayerStats[]> {
		const adminClient = createAdminClient();

		const [
			ratingsResult,
			profiles,
			[latestSessionId],
			activeDoublesPlayerIds,
			recentForms,
		] =
			await Promise.all([
				adminClient
					.from("player_double_ratings")
					.select(
						"player_id, matches_played, wins, losses, draws, sets_won, sets_lost, elo"
					)
					.order("elo", { ascending: false }),
				getCachedProfiles(),
				getLatestCompletedSessionsFresh(),
				getActiveDoublesPlayerIdsFresh(),
				getCachedRecentFormMaps(),
			]);

		if (ratingsResult.error) {
			console.error(
				"Error fetching doubles player ratings:",
				ratingsResult.error
			);
			throw new Error("Failed to fetch doubles player ratings");
		}

		const profilesMap = buildProfilesMap(profiles);
		const snapshotRows = latestSessionId
			? await getSessionSnapshotRows(latestSessionId, "player_doubles")
			: [];
		const sourceRows =
			snapshotRows.length > 0
				? snapshotRows.map((row) => ({
						player_id: row.entity_id,
						matches_played: row.matches_played,
						wins: row.wins,
						losses: row.losses,
						draws: row.draws,
						sets_won: row.sets_won,
						sets_lost: row.sets_lost,
						elo: toNumber(row.elo, 1500),
					}))
				: ((ratingsResult.data || []) as DoublesPlayerRatingRecord[]);

		const activeDoublesPlayerSet = new Set(activeDoublesPlayerIds);
		const doublesPlayerStats = sourceRows
			.filter(
				(rating) =>
					isPlayerRankingEligible({
						playerId: rating.player_id,
						matchesPlayed: rating.matches_played,
						activePlayerIds: activeDoublesPlayerSet,
						rankedPlayerIds,
						minimumMatches: MIN_DOUBLES_PLAYER_MATCHES,
					}),
			)
			.map((rating): PlayerStats => {
				const profile = profilesMap.get(rating.player_id);
				return {
					player_id: rating.player_id,
					display_name: profile?.display_name || "User",
					avatar: profile?.avatar || null,
					matches_played: rating.matches_played ?? 0,
					wins: rating.wins ?? 0,
					losses: rating.losses ?? 0,
					draws: rating.draws ?? 0,
					sets_won: rating.sets_won ?? 0,
					sets_lost: rating.sets_lost ?? 0,
					elo: toNumber(rating.elo, 1500),
					rank_movement: 0,
					rank_duration_days: null,
					rank_duration_capped: false,
					recent_form:
						recentForms.doublesPlayers[rating.player_id] ?? [],
				};
			});

		if (latestSessionId) {
			const rankMovements = await computeRankMovements(
				doublesPlayerStats.map((stat) => ({
					entityId: stat.player_id,
					elo: stat.elo,
					matchesPlayed: stat.matches_played,
				})),
				latestSessionId,
				"player_doubles"
			);

			doublesPlayerStats.forEach((stat) => {
				stat.rank_movement = rankMovements.get(stat.player_id) ?? 0;
			});
		}

		const rankDurations = await computeCurrentRankDurations({
			currentEntities: doublesPlayerStats.map((stat) => ({
				entityId: stat.player_id,
				elo: stat.elo,
			})),
			entityType: "player_doubles",
			minMatches: MIN_DOUBLES_PLAYER_MATCHES,
		});

		doublesPlayerStats.forEach((stat) => {
			const rankDuration = rankDurations.get(stat.player_id);
			if (!rankDuration) {
				return;
			}

			stat.rank_duration_days = rankDuration.days;
			stat.rank_duration_capped = false;
		});

		return doublesPlayerStats;
}

async function getFreshDoublesTeamStats(
	rankedPlayerIds: ReadonlySet<string>,
): Promise<TeamStats[]> {
		const adminClient = createAdminClient();

		const [
			ratingsResult,
			teams,
			profiles,
			[latestSessionId],
			activeDoublesTeamIds,
			recentForms,
		] = await Promise.all([
			adminClient
				.from("double_team_ratings")
				.select(
					"team_id, matches_played, wins, losses, draws, sets_won, sets_lost, elo"
				)
				.order("elo", { ascending: false }),
			getCachedDoubleTeams(),
			getCachedProfiles(),
			getLatestCompletedSessionsFresh(),
			getActiveDoublesTeamIdsFresh(),
			getCachedRecentFormMaps(),
		]);

		if (ratingsResult.error) {
			console.error(
				"Error fetching doubles team ratings:",
				ratingsResult.error
			);
			throw new Error("Failed to fetch doubles team ratings");
		}

		const teamsMap = new Map(
			teams.map((team) => [
				team.id,
				{ player_1_id: team.player_1_id, player_2_id: team.player_2_id },
			])
		);
		const profilesMap = buildProfilesMap(profiles);
		const snapshotRows = latestSessionId
			? await getSessionSnapshotRows(latestSessionId, "double_team")
			: [];
		const sourceRows =
			snapshotRows.length > 0
				? snapshotRows.map((row) => ({
						team_id: row.entity_id,
						matches_played: row.matches_played,
						wins: row.wins,
						losses: row.losses,
						draws: row.draws,
						sets_won: row.sets_won,
						sets_lost: row.sets_lost,
						elo: toNumber(row.elo, 1500),
					}))
				: ((ratingsResult.data || []) as DoublesTeamRatingRecord[]);
		const activeDoublesTeamSet = new Set(activeDoublesTeamIds);
		const doublesTeamStats = sourceRows
			.filter((rating) => {
				const team = teamsMap.get(rating.team_id);
				return Boolean(
					team &&
						isDoublesTeamRankingEligible({
							teamId: rating.team_id,
							player1Id: team.player_1_id,
							player2Id: team.player_2_id,
							matchesPlayed: rating.matches_played,
							activeTeamIds: activeDoublesTeamSet,
							rankedPlayerIds,
							minimumMatches: MIN_DOUBLES_TEAM_MATCHES,
						}),
				);
			})
			.map((rating): TeamStats | null => {
				const team = teamsMap.get(rating.team_id);
				if (!team) {
					return null;
				}

				const player1 = profilesMap.get(team.player_1_id);
				const player2 = profilesMap.get(team.player_2_id);

				return {
					team_id: rating.team_id,
					player1: {
						id: team.player_1_id,
						display_name: player1?.display_name || "User",
						avatar: player1?.avatar || null,
					},
					player2: {
						id: team.player_2_id,
						display_name: player2?.display_name || "User",
						avatar: player2?.avatar || null,
					},
					matches_played: rating.matches_played ?? 0,
					wins: rating.wins ?? 0,
					losses: rating.losses ?? 0,
					draws: rating.draws ?? 0,
					sets_won: rating.sets_won ?? 0,
					sets_lost: rating.sets_lost ?? 0,
					elo: toNumber(rating.elo, 1500),
					rank_movement: 0,
					rank_duration_days: null,
					rank_duration_capped: false,
					recent_form:
						recentForms.doublesTeams[rating.team_id] ?? [],
				};
			})
			.filter((team): team is TeamStats => team !== null);

		if (latestSessionId) {
			const rankMovements = await computeRankMovements(
				doublesTeamStats.map((stat) => ({
					entityId: stat.team_id,
					elo: stat.elo,
					matchesPlayed: stat.matches_played,
				})),
				latestSessionId,
				"double_team"
			);

			doublesTeamStats.forEach((stat) => {
				stat.rank_movement = rankMovements.get(stat.team_id) ?? 0;
			});
		}

		const rankDurations = await computeCurrentRankDurations({
			currentEntities: doublesTeamStats.map((stat) => ({
				entityId: stat.team_id,
				elo: stat.elo,
			})),
			entityType: "double_team",
			minMatches: MIN_DOUBLES_TEAM_MATCHES,
		});

		doublesTeamStats.forEach((stat) => {
			const rankDuration = rankDurations.get(stat.team_id);
			if (!rankDuration) {
				return;
			}

			stat.rank_duration_days = rankDuration.days;
			stat.rank_duration_capped = false;
		});

		return doublesTeamStats;
}

function isViewMode(value: string): value is ViewMode {
	return (
		value === "all" ||
		value === "singles" ||
		value === "doubles_player" ||
		value === "doubles_team"
	);
}

/**
 * GET /api/statistics
 *
 * Fetch player statistics (singles, doubles players, doubles teams)
 *
 * Query parameters:
 * - view (optional): "singles" | "doubles_player" | "doubles_team" | "all"
 *   If not provided or "all", returns all statistics.
 *   If a specific view is provided, returns only that view's data.
 *
 * Security:
 * - Requires authentication
 * - Returns public statistics shared by all authenticated users
 */
export async function GET(request: NextRequest) {
	try {
		const authHeader = request.headers.get("authorization");
		const user = await verifyUser(authHeader);

		if (!user) {
			return jsonNoStore(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 }
			);
		}

		const { searchParams } = new URL(request.url);
		const viewParam = searchParams.get("view") || "all";

		if (!isViewMode(viewParam)) {
			return jsonNoStore(
				{ error: "Invalid view parameter." },
				{ status: 400 }
			);
		}

		const responseBody: {
			singles?: PlayerStats[];
			doublesPlayers?: PlayerStats[];
			doublesTeams?: TeamStats[];
			eligibility: typeof STATISTICS_ELIGIBILITY;
		} = {
			eligibility: STATISTICS_ELIGIBILITY,
		};
		const rankedPlayerIds = new Set(
			(await listAllAuthUsers(createAdminClient()))
				.filter(isRankedPlayerAccount)
				.map((rankedUser) => rankedUser.id),
		);

		if (viewParam === "all") {
			const [singles, doublesPlayers, doublesTeams] = await Promise.all([
				getFreshSinglesStats(rankedPlayerIds),
				getFreshDoublesPlayerStats(rankedPlayerIds),
				getFreshDoublesTeamStats(rankedPlayerIds),
			]);

			responseBody.singles = singles;
			responseBody.doublesPlayers = doublesPlayers;
			responseBody.doublesTeams = doublesTeams;
		} else if (viewParam === "singles") {
			responseBody.singles = await getFreshSinglesStats(rankedPlayerIds);
		} else if (viewParam === "doubles_player") {
			responseBody.doublesPlayers = await getFreshDoublesPlayerStats(rankedPlayerIds);
		} else {
			responseBody.doublesTeams = await getFreshDoublesTeamStats(rankedPlayerIds);
		}

		return jsonNoStore(responseBody);
	} catch (error) {
		console.error("Unexpected error in GET /api/statistics:", error);
		return jsonNoStore(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
