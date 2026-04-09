import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
	getLatestTwoCompletedSessions,
	computeRankMovements,
} from "@/lib/elo/rank-movements";
import { createAdminClient, verifyUser } from "@/lib/supabase/admin";
import {
	MAX_DOUBLES_TEAM_INACTIVITY_DAYS,
	MAX_SINGLES_INACTIVITY_DAYS,
	MIN_DOUBLES_TEAM_MATCHES,
} from "@/lib/statistics/min-matches";

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

type RecentSinglesMatchRecord = {
	player_ids: string[] | null;
};

type RecentDoublesTeamMatchRecord = {
	team_1_id: string | null;
	team_2_id: string | null;
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

const getCachedLatestCompletedSessions = unstable_cache(
	async () => getLatestTwoCompletedSessions(),
	["statistics-latest-two-completed-sessions"],
	{ revalidate: STATISTICS_REVALIDATE_SECONDS, tags: ["statistics"] }
);

const getCachedActiveSinglesPlayerIds = unstable_cache(
	async (): Promise<string[] | null> => {
		const adminClient = createAdminClient();
		const cutoffDate = new Date(
			Date.now() - MAX_SINGLES_INACTIVITY_DAYS * 24 * 60 * 60 * 1000
		).toISOString();

		const { data: recentSessions, error: sessionsError } = await adminClient
			.from("sessions")
			.select("id")
			.eq("status", "completed")
			.gte("completed_at", cutoffDate);

		if (sessionsError) {
			console.error(
				"Error fetching recent completed sessions for singles activity:",
				sessionsError
			);
			return null;
		}

		const sessionIds = ((recentSessions || []) as RecentSessionRecord[]).map(
			(session) => session.id
		);

		if (sessionIds.length === 0) {
			return [];
		}

		const { data: recentSinglesMatches, error: matchesError } =
			await adminClient
				.from("session_matches")
				.select("player_ids")
				.eq("match_type", "singles")
				.eq("status", "completed")
				.in("session_id", sessionIds);

		if (matchesError) {
			console.error(
				"Error fetching recent singles matches for activity filter:",
				matchesError
			);
			return null;
		}

		const activePlayerIds = new Set<string>();
		for (const match of (recentSinglesMatches || []) as RecentSinglesMatchRecord[]) {
			const playerIds = (match.player_ids as string[] | null) || [];
			for (const playerId of playerIds.slice(0, 2)) {
				if (playerId) {
					activePlayerIds.add(playerId);
				}
			}
		}

		return Array.from(activePlayerIds);
	},
	["statistics-active-singles-players"],
	{ revalidate: STATISTICS_REVALIDATE_SECONDS, tags: ["statistics"] }
);

const getCachedActiveDoublesTeamIds = unstable_cache(
	async (): Promise<string[] | null> => {
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
			return null;
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
			return null;
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
	},
	["statistics-active-doubles-teams"],
	{ revalidate: STATISTICS_REVALIDATE_SECONDS, tags: ["statistics"] }
);

const getCachedSinglesStats = unstable_cache(
	async (): Promise<PlayerStats[]> => {
		const adminClient = createAdminClient();

		const [ratingsResult, profiles, [latestSessionId], activeSinglesPlayerIds] =
			await Promise.all([
				adminClient
					.from("player_ratings")
					.select(
						"player_id, matches_played, wins, losses, draws, sets_won, sets_lost, elo"
					)
					.order("elo", { ascending: false }),
				getCachedProfiles(),
				getCachedLatestCompletedSessions(),
				getCachedActiveSinglesPlayerIds(),
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

		const activeSinglesPlayerSet =
			activeSinglesPlayerIds === null
				? null
				: new Set(activeSinglesPlayerIds);
		const singlesStats = sourceRows
			.filter((rating) =>
				activeSinglesPlayerSet ? activeSinglesPlayerSet.has(rating.player_id) : true
			)
			.map((rating) => {
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

		return singlesStats;
	},
	["statistics-singles"],
	{ revalidate: STATISTICS_REVALIDATE_SECONDS, tags: ["statistics"] }
);

const getCachedDoublesPlayerStats = unstable_cache(
	async (): Promise<PlayerStats[]> => {
		const adminClient = createAdminClient();

		const [ratingsResult, profiles, [latestSessionId]] =
			await Promise.all([
				adminClient
					.from("player_double_ratings")
					.select(
						"player_id, matches_played, wins, losses, draws, sets_won, sets_lost, elo"
					)
					.order("elo", { ascending: false }),
				getCachedProfiles(),
				getCachedLatestCompletedSessions(),
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

		const doublesPlayerStats = sourceRows.map((rating) => {
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

		return doublesPlayerStats;
	},
	["statistics-doubles-player"],
	{ revalidate: STATISTICS_REVALIDATE_SECONDS, tags: ["statistics"] }
);

const getCachedDoublesTeamStats = unstable_cache(
	async (): Promise<TeamStats[]> => {
		const adminClient = createAdminClient();

		const [
			ratingsResult,
			teams,
			profiles,
			[latestSessionId],
			activeDoublesTeamIds,
		] = await Promise.all([
			adminClient
				.from("double_team_ratings")
				.select(
					"team_id, matches_played, wins, losses, draws, sets_won, sets_lost, elo"
				)
				.order("elo", { ascending: false }),
			getCachedDoubleTeams(),
			getCachedProfiles(),
			getCachedLatestCompletedSessions(),
			getCachedActiveDoublesTeamIds(),
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
		const activeDoublesTeamSet =
			activeDoublesTeamIds === null ? null : new Set(activeDoublesTeamIds);
		const doublesTeamStats = sourceRows
			.filter((rating) => {
				const matchesPlayed = rating.matches_played ?? 0;
				const passesMatchMinimum =
					matchesPlayed >= MIN_DOUBLES_TEAM_MATCHES;
				const passesActivity =
					activeDoublesTeamSet === null ||
					activeDoublesTeamSet.has(rating.team_id);

				return passesMatchMinimum && passesActivity;
			})
			.map((rating) => {
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

		return doublesTeamStats;
	},
	["statistics-doubles-team"],
	{ revalidate: STATISTICS_REVALIDATE_SECONDS, tags: ["statistics"] }
);

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
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 }
			);
		}

		const { searchParams } = new URL(request.url);
		const viewParam = searchParams.get("view") || "all";

		if (!isViewMode(viewParam)) {
			return NextResponse.json(
				{ error: "Invalid view parameter." },
				{ status: 400 }
			);
		}

		const responseBody: {
			singles?: PlayerStats[];
			doublesPlayers?: PlayerStats[];
			doublesTeams?: TeamStats[];
		} = {};

		if (viewParam === "all") {
			const [singles, doublesPlayers, doublesTeams] = await Promise.all([
				getCachedSinglesStats(),
				getCachedDoublesPlayerStats(),
				getCachedDoublesTeamStats(),
			]);

			responseBody.singles = singles;
			responseBody.doublesPlayers = doublesPlayers;
			responseBody.doublesTeams = doublesTeams;
		} else if (viewParam === "singles") {
			responseBody.singles = await getCachedSinglesStats();
		} else if (viewParam === "doubles_player") {
			responseBody.doublesPlayers = await getCachedDoublesPlayerStats();
		} else {
			responseBody.doublesTeams = await getCachedDoublesTeamStats();
		}

		return NextResponse.json(responseBody);
	} catch (error) {
		console.error("Unexpected error in GET /api/statistics:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
