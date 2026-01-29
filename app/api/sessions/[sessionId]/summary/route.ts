import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

type SessionPlayerSummary = {
	player_id: string;
	display_name: string;
	avatar: string | null;
	elo_before: number;
	elo_after: number;
	elo_change: number;
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
};

type SessionTeamSummary = {
	team_id: string;
	player1_id: string;
	player2_id: string;
	player1_name: string;
	player2_name: string;
	player1_avatar: string | null;
	player2_avatar: string | null;
	elo_before: number;
	elo_after: number;
	elo_change: number;
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
};

/**
 * Get the previous completed session ID (Session N-1) for a given session
 * Returns null if no previous session exists
 */
async function getPreviousSessionId(
	sessionId: string
): Promise<string | null> {
	const adminClient = createAdminClient();

	// Get current session's created_at
	const { data: currentSession, error: sessionError } = await adminClient
		.from("sessions")
		.select("created_at")
		.eq("id", sessionId)
		.single();

	if (sessionError || !currentSession) {
		return null;
	}

	// Find most recent completed session before current session
	const { data: previousSessions, error: prevSessionError } =
		await adminClient
			.from("sessions")
			.select("id")
			.lt("created_at", currentSession.created_at)
			.eq("status", "completed")
			.order("created_at", { ascending: false })
			.limit(1);

	if (prevSessionError || !previousSessions || previousSessions.length === 0) {
		return null;
	}

	return previousSessions[0].id;
}

/**
 * Batch load snapshots for multiple entities from a session
 * Returns Map of entity_id -> { elo, matches_played, wins, losses, draws }
 */
async function loadSnapshots(
	sessionId: string | null,
	entityType: "player_singles" | "player_doubles" | "double_team",
	entityIds: string[]
): Promise<
	Map<
		string,
		{
			elo: number;
			matches_played: number;
			wins: number;
			losses: number;
			draws: number;
		}
	>
> {
	const adminClient = createAdminClient();
	const snapshotMap = new Map<
		string,
		{
			elo: number;
			matches_played: number;
			wins: number;
			losses: number;
			draws: number;
		}
	>();

	// If no session, return empty map (will use default baseline 1500/0)
	if (!sessionId || entityIds.length === 0) {
		return snapshotMap;
	}

	const { data: snapshots, error } = await adminClient
		.from("session_rating_snapshots")
		.select("entity_id, elo, matches_played, wins, losses, draws")
		.eq("session_id", sessionId)
		.eq("entity_type", entityType)
		.in("entity_id", entityIds);

	if (error || !snapshots) {
		console.error("Error loading snapshots:", error);
		return snapshotMap;
	}

	for (const snapshot of snapshots) {
		const elo =
			typeof snapshot.elo === "string"
				? parseFloat(snapshot.elo)
				: Number(snapshot.elo);
		snapshotMap.set(snapshot.entity_id, {
			elo,
			matches_played: snapshot.matches_played ?? 0,
			wins: snapshot.wins ?? 0,
			losses: snapshot.losses ?? 0,
			draws: snapshot.draws ?? 0,
		});
	}

	return snapshotMap;
}

/**
 * GET /api/sessions/[sessionId]/summary?type=singles|doubles_player|doubles_team
 *
 * Get session-only summary statistics using snapshot + aggregation (NO REPLAY)
 *
 * Query params:
 * - type (optional): "singles" | "doubles_player" | "doubles_team"
 *   If not provided, returns all three summaries
 *
 * Returns:
 * - singles: Player summary for singles matches only
 * - doubles_player: Player summary for player_double_ratings (doubles matches)
 * - doubles_team: Team summary for double_team_ratings
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: { sessionId: string } }
) {
	const adminClient = createAdminClient();

	try {
		const authHeader = request.headers.get("authorization");
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 }
			);
		}

		const token = authHeader.replace("Bearer ", "");
		const sessionId = params.sessionId;
		const { searchParams } = new URL(request.url);
		const type = searchParams.get("type") as
			| "singles"
			| "doubles_player"
			| "doubles_team"
			| null;

		if (!sessionId) {
			return NextResponse.json(
				{ error: "Session ID is required" },
				{ status: 400 }
			);
		}

		// Verify user is authenticated
		const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
			global: {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		});

		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser(token);

		if (userError || !user) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 }
			);
		}

		// Verify session exists
		const { data: session, error: sessionError } = await adminClient
			.from("sessions")
			.select("id, status")
			.eq("id", sessionId)
			.single();

		if (sessionError || !session) {
			return NextResponse.json(
				{ error: "Session not found" },
				{ status: 404 }
			);
		}

		// Get all players in this session
		const { data: sessionPlayers, error: playersError } = await adminClient
			.from("session_players")
			.select("player_id")
			.eq("session_id", sessionId);

		if (playersError) {
			console.error("Error fetching session players:", playersError);
			return NextResponse.json(
				{ error: "Failed to fetch session players" },
				{ status: 500 }
			);
		}

		const playerIds =
			sessionPlayers && sessionPlayers.length > 0
				? sessionPlayers.map((sp) => sp.player_id)
				: [];

		// Get player display names and avatars from profiles table (fast database query)
		const { data: profiles, error: profilesError } = await supabase
			.from("profiles")
			.select("id, display_name, avatar_url");

		if (profilesError) {
			console.error("Error fetching profiles:", profilesError);
			return NextResponse.json(
				{ error: "Failed to fetch user data" },
				{ status: 500 }
			);
		}

		const userMap = new Map(
			(profiles || []).map((p) => [
				p.id,
				{
					display_name: p.display_name || "Unknown",
					avatar: p.avatar_url || null,
				},
			])
		);

		// Get all matches in this session
		const { data: sessionMatches, error: matchesError } = await adminClient
			.from("session_matches")
			.select(
				"id, match_type, player_ids, team1_score, team2_score, status, team_1_id, team_2_id, round_number, match_order"
			)
			.eq("session_id", sessionId)
			.eq("status", "completed");

		if (matchesError) {
			console.error("Error fetching session matches:", matchesError);
			return NextResponse.json(
				{ error: "Failed to fetch session matches" },
				{ status: 500 }
			);
		}

		const singlesMatches =
			sessionMatches?.filter((m) => m.match_type === "singles") || [];
		const doublesMatches =
			sessionMatches?.filter((m) => m.match_type === "doubles") || [];

		const result: {
			singles?: SessionPlayerSummary[];
			doubles_player?: SessionPlayerSummary[];
			doubles_team?: SessionTeamSummary[];
		} = {};

		// Get previous session ID for snapshot loading
		const previousSessionId = await getPreviousSessionId(sessionId);

		// 1. SINGLES SUMMARY - Using match_elo_history for elo_before and elo_after
		if (!type || type === "singles") {
			if (singlesMatches.length > 0) {
				// Sort matches by round_number and match_order
				const sortedSinglesMatches = [...singlesMatches].sort((a, b) => {
					if (a.round_number !== b.round_number) {
						return a.round_number - b.round_number;
					}
					return a.match_order - b.match_order;
				});

				// Collect all players who played singles matches
				const singlesPlayerIds = new Set<string>();
				for (const match of sortedSinglesMatches) {
					const playerIds = (match.player_ids as string[]) || [];
					if (playerIds.length >= 2) {
						singlesPlayerIds.add(playerIds[0]);
						singlesPlayerIds.add(playerIds[1]);
					}
				}

				// Get match Elo history for singles matches
				const singlesMatchIds = sortedSinglesMatches.map((m) => m.id);
				const { data: matchHistory, error: historyError } =
					await adminClient
						.from("match_elo_history")
						.select("*")
						.in(
							"match_id",
							singlesMatchIds.length > 0
								? singlesMatchIds
								: ["00000000-0000-0000-0000-000000000000"]
						);

				if (historyError) {
					console.error("Error fetching match history:", historyError);
				}

				// Create a map of match_id -> history for quick lookup
				const historyMap = new Map(
					(matchHistory || []).map((h) => [h.match_id, h])
				);

				// Track elo_before and elo_after per player
				const playerEloBeforeMap = new Map<string, number>();
				const playerEloAfterMap = new Map<string, number>();
				const playerDeltaMap = new Map<string, number>();
				const playerStatsMap = new Map<
					string,
					{ matchesPlayed: number; wins: number; losses: number; draws: number }
				>();

				for (const playerId of singlesPlayerIds) {
					playerDeltaMap.set(playerId, 0);
					playerStatsMap.set(playerId, {
						matchesPlayed: 0,
						wins: 0,
						losses: 0,
						draws: 0,
					});
				}

				// Process matches in order to find first and last elo values
				for (const match of sortedSinglesMatches) {
					const playerIds = (match.player_ids as string[]) || [];
					if (playerIds.length < 2 || match.team1_score === null || match.team2_score === null)
						continue;

					const history = historyMap.get(match.id);
					if (!history) continue;

					// Process player1
					const player1Id = playerIds[0];
					if (singlesPlayerIds.has(player1Id)) {
						// Set elo_before from first match
						if (!playerEloBeforeMap.has(player1Id)) {
							const eloBefore =
								typeof history.player1_elo_before === "string"
									? parseFloat(history.player1_elo_before)
									: Number(history.player1_elo_before ?? 1500);
							playerEloBeforeMap.set(player1Id, eloBefore);
						}

						// Always update elo_after (last match will be the final value)
						const eloAfter =
							typeof history.player1_elo_after === "string"
								? parseFloat(history.player1_elo_after)
								: Number(history.player1_elo_after ?? 1500);
						playerEloAfterMap.set(player1Id, eloAfter);

						// Aggregate delta
						const delta =
							typeof history.player1_elo_delta === "string"
								? parseFloat(history.player1_elo_delta)
								: Number(history.player1_elo_delta ?? 0);
						playerDeltaMap.set(
							player1Id,
							(playerDeltaMap.get(player1Id) ?? 0) + delta
						);

						// Update stats
						const stats = playerStatsMap.get(player1Id)!;
						stats.matchesPlayed += 1;
						if (match.team1_score > match.team2_score) {
							stats.wins += 1;
						} else if (match.team1_score < match.team2_score) {
							stats.losses += 1;
						} else {
							stats.draws += 1;
						}
					}

					// Process player2
					const player2Id = playerIds[1];
					if (singlesPlayerIds.has(player2Id)) {
						// Set elo_before from first match
						if (!playerEloBeforeMap.has(player2Id)) {
							const eloBefore =
								typeof history.player2_elo_before === "string"
									? parseFloat(history.player2_elo_before)
									: Number(history.player2_elo_before ?? 1500);
							playerEloBeforeMap.set(player2Id, eloBefore);
						}

						// Always update elo_after (last match will be the final value)
						const eloAfter =
							typeof history.player2_elo_after === "string"
								? parseFloat(history.player2_elo_after)
								: Number(history.player2_elo_after ?? 1500);
						playerEloAfterMap.set(player2Id, eloAfter);

						// Aggregate delta
						const delta =
							typeof history.player2_elo_delta === "string"
								? parseFloat(history.player2_elo_delta)
								: Number(history.player2_elo_delta ?? 0);
						playerDeltaMap.set(
							player2Id,
							(playerDeltaMap.get(player2Id) ?? 0) + delta
						);

						// Update stats
						const stats = playerStatsMap.get(player2Id)!;
						stats.matchesPlayed += 1;
						if (match.team2_score > match.team1_score) {
							stats.wins += 1;
						} else if (match.team2_score < match.team1_score) {
							stats.losses += 1;
						} else {
							stats.draws += 1;
						}
					}
				}

				// Build summary using elo_before and elo_after from match_elo_history
				const singlesSummary: SessionPlayerSummary[] = [];
				for (const playerId of singlesPlayerIds) {
					const eloBefore = playerEloBeforeMap.get(playerId) ?? 1500;
					const eloAfter = playerEloAfterMap.get(playerId) ?? eloBefore;
					const eloChange = playerDeltaMap.get(playerId) ?? 0;

					const stats = playerStatsMap.get(playerId)!;
					const userInfo = userMap.get(playerId);
					if (!userInfo) continue;

					singlesSummary.push({
						player_id: playerId,
						display_name: userInfo.display_name,
						avatar: userInfo.avatar,
						elo_before: eloBefore,
						elo_after: eloAfter,
						elo_change: eloChange,
						matches_played: stats.matchesPlayed,
						wins: stats.wins,
						losses: stats.losses,
						draws: stats.draws,
					});
				}

				// Sort by: wins DESC, losses ASC, elo_change DESC
				singlesSummary.sort((a, b) => {
					if (a.wins !== b.wins) {
						return b.wins - a.wins; // DESC
					}
					if (a.losses !== b.losses) {
						return a.losses - b.losses; // ASC
					}
					return b.elo_change - a.elo_change; // DESC
				});

				result.singles = singlesSummary;
			} else {
				result.singles = [];
			}
		}

		// 2. DOUBLES PLAYER SUMMARY - Using snapshot + aggregation (NO REPLAY)
		if (!type || type === "doubles_player") {
			if (doublesMatches.length > 0) {
				// Collect all players who played doubles matches
				const doublesPlayerIds = new Set<string>();
				for (const match of doublesMatches) {
					const playerIds = (match.player_ids as string[]) || [];
					for (const playerId of playerIds) {
						doublesPlayerIds.add(playerId);
					}
				}

				// Load baseline from Session N-1 snapshot
				const baselineSnapshots = await loadSnapshots(
					previousSessionId,
					"player_doubles",
					Array.from(doublesPlayerIds)
				);

				// Get match Elo history for doubles matches
				const doublesMatchIds = doublesMatches.map((m) => m.id);
				const { data: matchHistory, error: historyError } =
					await adminClient
						.from("match_elo_history")
						.select("match_id, team1_id, team2_id, team1_elo_delta, team2_elo_delta")
						.in(
							"match_id",
							doublesMatchIds.length > 0
								? doublesMatchIds
								: ["00000000-0000-0000-0000-000000000000"]
						);

				if (historyError) {
					console.error("Error fetching match history:", historyError);
				}

				// Map match IDs to match data for player team lookup
				const matchMap = new Map(
					doublesMatches.map((m) => [m.id, m])
				);

				// Aggregate deltas per player (player doubles delta = team delta)
				const playerDeltaMap = new Map<string, number>();
				const playerStatsMap = new Map<
					string,
					{ matchesPlayed: number; wins: number; losses: number; draws: number }
				>();

				for (const playerId of doublesPlayerIds) {
					playerDeltaMap.set(playerId, 0);
					playerStatsMap.set(playerId, {
						matchesPlayed: 0,
						wins: 0,
						losses: 0,
						draws: 0,
					});
				}

				// Aggregate deltas: map team deltas to players based on match player_ids
				for (const history of matchHistory || []) {
					const match = matchMap.get(history.match_id);
					if (
						!match ||
						match.team1_score === null ||
						match.team2_score === null ||
						!match.player_ids ||
						(match.player_ids as string[]).length < 4
					)
						continue;

					const playerIds = match.player_ids as string[];
					const team1Players = [playerIds[0], playerIds[1]];
					const team2Players = [playerIds[2], playerIds[3]];

					// Team1 delta applies to team1 players
					if (history.team1_elo_delta !== null && history.team1_elo_delta !== undefined) {
						const team1Delta =
							typeof history.team1_elo_delta === "string"
								? parseFloat(history.team1_elo_delta)
								: Number(history.team1_elo_delta);
						for (const playerId of team1Players) {
							if (doublesPlayerIds.has(playerId)) {
								playerDeltaMap.set(
									playerId,
									(playerDeltaMap.get(playerId) ?? 0) + team1Delta
								);

								const stats = playerStatsMap.get(playerId)!;
								stats.matchesPlayed += 1;
								if (match.team1_score > match.team2_score) {
									stats.wins += 1;
								} else if (match.team1_score < match.team2_score) {
									stats.losses += 1;
								} else {
									stats.draws += 1;
								}
							}
						}
					}

					// Team2 delta applies to team2 players
					if (history.team2_elo_delta !== null && history.team2_elo_delta !== undefined) {
						const team2Delta =
							typeof history.team2_elo_delta === "string"
								? parseFloat(history.team2_elo_delta)
								: Number(history.team2_elo_delta);
						for (const playerId of team2Players) {
							if (doublesPlayerIds.has(playerId)) {
								playerDeltaMap.set(
									playerId,
									(playerDeltaMap.get(playerId) ?? 0) + team2Delta
								);

								const stats = playerStatsMap.get(playerId)!;
								stats.matchesPlayed += 1;
								if (match.team2_score > match.team1_score) {
									stats.wins += 1;
								} else if (match.team2_score < match.team1_score) {
									stats.losses += 1;
								} else {
									stats.draws += 1;
								}
							}
						}
					}
				}

				// Build summary: elo_before from snapshot, elo_after calculated as elo_before + elo_change, elo_change from this session only
				// Note: match_elo_history only stores team values for doubles, not individual player values
				// So we use snapshots for elo_before and calculate elo_after as elo_before + elo_change
				const doublesPlayerSummary: SessionPlayerSummary[] = [];
				for (const playerId of doublesPlayerIds) {
					const baseline = baselineSnapshots.get(playerId);
					const eloBefore = baseline?.elo ?? 1500;
					const totalDelta = playerDeltaMap.get(playerId) ?? 0;
					const eloChange = totalDelta; // Change in this session only
					const eloAfter = eloBefore + eloChange; // Elo after this session

					const stats = playerStatsMap.get(playerId)!;
					const userInfo = userMap.get(playerId);
					if (!userInfo) continue;

					doublesPlayerSummary.push({
						player_id: playerId,
						display_name: userInfo.display_name,
						avatar: userInfo.avatar,
						elo_before: eloBefore,
						elo_after: eloAfter,
						elo_change: eloChange,
						matches_played: stats.matchesPlayed,
						wins: stats.wins,
						losses: stats.losses,
						draws: stats.draws,
					});
				}

				// Sort by: wins DESC, losses ASC, elo_change DESC
				doublesPlayerSummary.sort((a, b) => {
					if (a.wins !== b.wins) {
						return b.wins - a.wins; // DESC
					}
					if (a.losses !== b.losses) {
						return a.losses - b.losses; // ASC
					}
					return b.elo_change - a.elo_change; // DESC
				});

				result.doubles_player = doublesPlayerSummary;
			} else {
				result.doubles_player = [];
			}
		}

		// 3. DOUBLES TEAM SUMMARY - Using snapshot + aggregation + stored team IDs (NO getOrCreateDoubleTeam)
		if (!type || type === "doubles_team") {
			if (doublesMatches.length > 0) {
				// Collect team IDs from stored team_1_id / team_2_id columns (NO getOrCreateDoubleTeam calls)
				const teamIds = new Set<string>();
				const teamPlayerMap = new Map<string, { player1Id: string; player2Id: string }>();

				for (const match of doublesMatches) {
					if (
						match.team1_score === null ||
						match.team2_score === null ||
						!match.player_ids ||
						(match.player_ids as string[]).length < 4
					)
						continue;

					const playerIds = match.player_ids as string[];
					const team1Id = match.team_1_id;
					const team2Id = match.team_2_id;

					if (team1Id) {
						teamIds.add(team1Id);
						if (!teamPlayerMap.has(team1Id)) {
							teamPlayerMap.set(team1Id, {
								player1Id: playerIds[0],
								player2Id: playerIds[1],
							});
						}
					}

					if (team2Id) {
						teamIds.add(team2Id);
						if (!teamPlayerMap.has(team2Id)) {
							teamPlayerMap.set(team2Id, {
								player1Id: playerIds[2],
								player2Id: playerIds[3],
							});
						}
					}
				}

				// Sort matches by round_number and match_order
				const sortedDoublesMatches = [...doublesMatches].sort((a, b) => {
					if (a.round_number !== b.round_number) {
						return a.round_number - b.round_number;
					}
					return a.match_order - b.match_order;
				});

				// Get match Elo history for doubles matches
				const doublesMatchIds = sortedDoublesMatches.map((m) => m.id);
				const { data: matchHistory, error: historyError } =
					await adminClient
						.from("match_elo_history")
						.select("*")
						.in(
							"match_id",
							doublesMatchIds.length > 0
								? doublesMatchIds
								: ["00000000-0000-0000-0000-000000000000"]
						);

				if (historyError) {
					console.error("Error fetching match history:", historyError);
				}

				// Create a map of match_id -> history for quick lookup
				const historyMap = new Map(
					(matchHistory || []).map((h) => [h.match_id, h])
				);

				// Track elo_before and elo_after per team
				const teamEloBeforeMap = new Map<string, number>();
				const teamEloAfterMap = new Map<string, number>();
				const teamDeltaMap = new Map<string, number>();
				const teamStatsMap = new Map<
					string,
					{ matchesPlayed: number; wins: number; losses: number; draws: number }
				>();

				for (const teamId of teamIds) {
					teamDeltaMap.set(teamId, 0);
					teamStatsMap.set(teamId, {
						matchesPlayed: 0,
						wins: 0,
						losses: 0,
						draws: 0,
					});
				}

				// Process matches in order to find first and last elo values
				for (const match of sortedDoublesMatches) {
					if (
						match.team1_score === null ||
						match.team2_score === null ||
						!match.team_1_id ||
						!match.team_2_id
					)
						continue;

					const history = historyMap.get(match.id);
					if (!history) continue;

					const team1Id = match.team_1_id;
					const team2Id = match.team_2_id;

					// Process team1
					if (teamIds.has(team1Id)) {
						// Set elo_before from first match
						if (!teamEloBeforeMap.has(team1Id)) {
							const eloBefore =
								typeof history.team1_elo_before === "string"
									? parseFloat(history.team1_elo_before)
									: Number(history.team1_elo_before ?? 1500);
							teamEloBeforeMap.set(team1Id, eloBefore);
						}

						// Always update elo_after (last match will be the final value)
						const eloAfter =
							typeof history.team1_elo_after === "string"
								? parseFloat(history.team1_elo_after)
								: Number(history.team1_elo_after ?? 1500);
						teamEloAfterMap.set(team1Id, eloAfter);

						// Aggregate delta
						if (history.team1_elo_delta !== null && history.team1_elo_delta !== undefined) {
							const delta =
								typeof history.team1_elo_delta === "string"
									? parseFloat(history.team1_elo_delta)
									: Number(history.team1_elo_delta);
							teamDeltaMap.set(team1Id, (teamDeltaMap.get(team1Id) ?? 0) + delta);
						}

						// Update stats
						const stats = teamStatsMap.get(team1Id)!;
						stats.matchesPlayed += 1;
						if (match.team1_score > match.team2_score) {
							stats.wins += 1;
						} else if (match.team1_score < match.team2_score) {
							stats.losses += 1;
						} else {
							stats.draws += 1;
						}
					}

					// Process team2
					if (teamIds.has(team2Id)) {
						// Set elo_before from first match
						if (!teamEloBeforeMap.has(team2Id)) {
							const eloBefore =
								typeof history.team2_elo_before === "string"
									? parseFloat(history.team2_elo_before)
									: Number(history.team2_elo_before ?? 1500);
							teamEloBeforeMap.set(team2Id, eloBefore);
						}

						// Always update elo_after (last match will be the final value)
						const eloAfter =
							typeof history.team2_elo_after === "string"
								? parseFloat(history.team2_elo_after)
								: Number(history.team2_elo_after ?? 1500);
						teamEloAfterMap.set(team2Id, eloAfter);

						// Aggregate delta
						if (history.team2_elo_delta !== null && history.team2_elo_delta !== undefined) {
							const delta =
								typeof history.team2_elo_delta === "string"
									? parseFloat(history.team2_elo_delta)
									: Number(history.team2_elo_delta);
							teamDeltaMap.set(team2Id, (teamDeltaMap.get(team2Id) ?? 0) + delta);
						}

						// Update stats
						const stats = teamStatsMap.get(team2Id)!;
						stats.matchesPlayed += 1;
						if (match.team2_score > match.team1_score) {
							stats.wins += 1;
						} else if (match.team2_score < match.team1_score) {
							stats.losses += 1;
						} else {
							stats.draws += 1;
						}
					}
				}

				// Build summary using elo_before and elo_after from match_elo_history
				const doublesTeamSummary: SessionTeamSummary[] = [];
				for (const teamId of teamIds) {
					const eloBefore = teamEloBeforeMap.get(teamId) ?? 1500;
					const eloAfter = teamEloAfterMap.get(teamId) ?? eloBefore;
					const eloChange = teamDeltaMap.get(teamId) ?? 0;

					const stats = teamStatsMap.get(teamId)!;
					const players = teamPlayerMap.get(teamId);
					if (!players) continue;

					const player1Info = userMap.get(players.player1Id);
					const player2Info = userMap.get(players.player2Id);

					doublesTeamSummary.push({
						team_id: teamId,
						player1_id: players.player1Id,
						player2_id: players.player2Id,
						player1_name: player1Info?.display_name || "Unknown",
						player2_name: player2Info?.display_name || "Unknown",
						player1_avatar: player1Info?.avatar || null,
						player2_avatar: player2Info?.avatar || null,
						elo_before: eloBefore,
						elo_after: eloAfter,
						elo_change: eloChange,
						matches_played: stats.matchesPlayed,
						wins: stats.wins,
						losses: stats.losses,
						draws: stats.draws,
					});
				}

				// Sort by: wins DESC, losses ASC, elo_change DESC
				doublesTeamSummary.sort((a, b) => {
					if (a.wins !== b.wins) {
						return b.wins - a.wins; // DESC
					}
					if (a.losses !== b.losses) {
						return a.losses - b.losses; // ASC
					}
					return b.elo_change - a.elo_change; // DESC
				});

				result.doubles_team = doublesTeamSummary;
			} else {
				result.doubles_team = [];
			}
		}

		return NextResponse.json(result);
	} catch (error) {
		console.error(
			"Unexpected error in GET /api/sessions/[sessionId]/summary:",
			error
		);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}