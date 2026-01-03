import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
	getSessionBaseline,
	replaySessionMatches,
	getDoublesPlayerBaseline,
	replayDoublesPlayerMatches,
	getDoublesTeamBaseline,
	replayDoublesTeamMatches,
} from "@/lib/elo/session-baseline";
import { getOrCreateDoubleTeam } from "@/lib/elo/double-teams";

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
	elo_before: number;
	elo_after: number;
	elo_change: number;
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
};

/**
 * GET /api/sessions/[sessionId]/summary?type=singles|doubles_player|doubles_team
 *
 * Get session-only summary statistics
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
		const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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

		// Get player display names and avatars
		const { data: users, error: usersError } =
			await adminClient.auth.admin.listUsers();
		if (usersError) {
			console.error("Error fetching users:", usersError);
			return NextResponse.json(
				{ error: "Failed to fetch user data" },
				{ status: 500 }
			);
		}

		const userMap = new Map(
			users.users.map((u) => [
				u.id,
				{
					display_name:
						u.user_metadata?.name ||
						u.user_metadata?.display_name ||
						u.email?.split("@")[0] ||
						"Unknown",
					avatar: u.user_metadata?.avatar_url || null,
				},
			])
		);

		// Get all matches in this session
		const { data: sessionMatches, error: matchesError } = await adminClient
			.from("session_matches")
			.select(
				"id, match_type, player_ids, team1_score, team2_score, status"
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

		// 1. SINGLES SUMMARY
		if (!type || type === "singles") {
			if (singlesMatches.length > 0) {
				const baselineState = await getSessionBaseline(sessionId);
				const postSessionState = await replaySessionMatches(
					sessionId,
					baselineState
				);

				const singlesSummary: SessionPlayerSummary[] = [];
				const singlesPlayerIds = new Set<string>();

				// Collect all players who played singles matches
				for (const match of singlesMatches) {
					const playerIds = (match.player_ids as string[]) || [];
					if (playerIds.length >= 2) {
						singlesPlayerIds.add(playerIds[0]);
						singlesPlayerIds.add(playerIds[1]);
					}
				}

				// Get match Elo history for singles matches
				const singlesMatchIds = singlesMatches.map((m) => m.id);
				const { data: matchHistory } = await adminClient
					.from("match_elo_history")
					.select("*")
					.in(
						"match_id",
						singlesMatchIds.length > 0
							? singlesMatchIds
							: ["00000000-0000-0000-0000-000000000000"]
					);

				for (const playerId of singlesPlayerIds) {
					const baseline = baselineState.get(playerId);
					const eloBefore = baseline?.elo ?? 1500;
					const postSession = postSessionState.get(playerId);
					const eloAfter = postSession?.elo ?? eloBefore;
					const eloChange = eloAfter - eloBefore;

					// Count singles matches only
					let matchesPlayed = 0;
					let wins = 0;
					let losses = 0;
					let draws = 0;

					for (const history of matchHistory || []) {
						if (
							history.player1_id === playerId ||
							history.player2_id === playerId
						) {
							const match = singlesMatches.find(
								(m) => m.id === history.match_id
							);
							if (
								!match ||
								match.team1_score === null ||
								match.team2_score === null
							)
								continue;

							const isPlayer1 = history.player1_id === playerId;
							const playerScore = isPlayer1
								? match.team1_score
								: match.team2_score;
							const opponentScore = isPlayer1
								? match.team2_score
								: match.team1_score;

							matchesPlayed += 1;

							if (playerScore > opponentScore) {
								wins += 1;
							} else if (playerScore < opponentScore) {
								losses += 1;
							} else {
								draws += 1;
							}
						}
					}

					const userInfo = userMap.get(playerId);
					if (!userInfo) continue;

					singlesSummary.push({
						player_id: playerId,
						display_name: userInfo.display_name,
						avatar: userInfo.avatar,
						elo_before: eloBefore,
						elo_after: eloAfter,
						elo_change: eloChange,
						matches_played: matchesPlayed,
						wins,
						losses,
						draws,
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

		// 2. DOUBLES PLAYER SUMMARY
		if (!type || type === "doubles_player") {
			if (doublesMatches.length > 0) {
				const baselineState =
					await getDoublesPlayerBaseline(sessionId);
				const postSessionState = await replayDoublesPlayerMatches(
					sessionId,
					baselineState
				);

				const doublesPlayerSummary: SessionPlayerSummary[] = [];
				const doublesPlayerIds = new Set<string>();

				// Collect all players who played doubles matches
				for (const match of doublesMatches) {
					const playerIds = (match.player_ids as string[]) || [];
					for (const playerId of playerIds) {
						doublesPlayerIds.add(playerId);
					}
				}

				for (const playerId of doublesPlayerIds) {
					const baseline = baselineState.get(playerId);
					const eloBefore = baseline?.elo ?? 1500;
					const postSession = postSessionState.get(playerId);
					const eloAfter = postSession?.elo ?? eloBefore;
					const eloChange = eloAfter - eloBefore;

					// Count doubles matches only
					let matchesPlayed = 0;
					let wins = 0;
					let losses = 0;
					let draws = 0;

					for (const match of doublesMatches) {
						const playerIds = (match.player_ids as string[]) || [];
						if (!playerIds.includes(playerId)) continue;
						if (
							match.team1_score === null ||
							match.team2_score === null
						)
							continue;

						const playerIndex = playerIds.indexOf(playerId);
						const isTeam1 = playerIndex < 2;
						const teamScore = isTeam1
							? match.team1_score
							: match.team2_score;
						const opponentScore = isTeam1
							? match.team2_score
							: match.team1_score;

						matchesPlayed += 1;

						if (teamScore > opponentScore) {
							wins += 1;
						} else if (teamScore < opponentScore) {
							losses += 1;
						} else {
							draws += 1;
						}
					}

					const userInfo = userMap.get(playerId);
					if (!userInfo) continue;

					doublesPlayerSummary.push({
						player_id: playerId,
						display_name: userInfo.display_name,
						avatar: userInfo.avatar,
						elo_before: eloBefore,
						elo_after: eloAfter,
						elo_change: eloChange,
						matches_played: matchesPlayed,
						wins,
						losses,
						draws,
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

		// 3. DOUBLES TEAM SUMMARY
		if (!type || type === "doubles_team") {
			if (doublesMatches.length > 0) {
				const baselineState = await getDoublesTeamBaseline(sessionId);
				const postSessionState = await replayDoublesTeamMatches(
					sessionId,
					baselineState
				);

				const doublesTeamSummary: SessionTeamSummary[] = [];
				const teamMap = new Map<string, SessionTeamSummary>();

				for (const match of doublesMatches) {
					if (
						match.team1_score === null ||
						match.team2_score === null ||
						!match.player_ids ||
						(match.player_ids as string[]).length < 4
					)
						continue;

					const playerIds = match.player_ids as string[];
					const team1Id = await getOrCreateDoubleTeam(
						playerIds[0],
						playerIds[1]
					);
					const team2Id = await getOrCreateDoubleTeam(
						playerIds[2],
						playerIds[3]
					);

					// Team 1
					if (!teamMap.has(team1Id)) {
						const team1State = postSessionState.get(team1Id);
						const team1Baseline = baselineState.get(team1Id);
						const eloBefore = team1Baseline?.elo ?? 1500;
						const eloAfter = team1State?.elo ?? eloBefore;
						const eloChange = eloAfter - eloBefore;

						const player1Info = userMap.get(playerIds[0]);
						const player2Info = userMap.get(playerIds[1]);

						teamMap.set(team1Id, {
							team_id: team1Id,
							player1_id: playerIds[0],
							player2_id: playerIds[1],
							player1_name:
								player1Info?.display_name || "Unknown",
							player2_name:
								player2Info?.display_name || "Unknown",
							elo_before: eloBefore,
							elo_after: eloAfter,
							elo_change: eloChange,
							matches_played: 0,
							wins: 0,
							losses: 0,
							draws: 0,
						});
					}

					const team1Summary = teamMap.get(team1Id)!;
					team1Summary.matches_played += 1;
					if (match.team1_score > match.team2_score) {
						team1Summary.wins += 1;
					} else if (match.team1_score < match.team2_score) {
						team1Summary.losses += 1;
					} else {
						team1Summary.draws += 1;
					}

					// Team 2
					if (!teamMap.has(team2Id)) {
						const team2State = postSessionState.get(team2Id);
						const team2Baseline = baselineState.get(team2Id);
						const eloBefore = team2Baseline?.elo ?? 1500;
						const eloAfter = team2State?.elo ?? eloBefore;
						const eloChange = eloAfter - eloBefore;

						const player3Info = userMap.get(playerIds[2]);
						const player4Info = userMap.get(playerIds[3]);

						teamMap.set(team2Id, {
							team_id: team2Id,
							player1_id: playerIds[2],
							player2_id: playerIds[3],
							player1_name:
								player3Info?.display_name || "Unknown",
							player2_name:
								player4Info?.display_name || "Unknown",
							elo_before: eloBefore,
							elo_after: eloAfter,
							elo_change: eloChange,
							matches_played: 0,
							wins: 0,
							losses: 0,
							draws: 0,
						});
					}

					const team2Summary = teamMap.get(team2Id)!;
					team2Summary.matches_played += 1;
					if (match.team2_score > match.team1_score) {
						team2Summary.wins += 1;
					} else if (match.team2_score < match.team1_score) {
						team2Summary.losses += 1;
					} else {
						team2Summary.draws += 1;
					}
				}

				// Convert map to array and sort
				const teamsArray = Array.from(teamMap.values());
				teamsArray.sort((a, b) => {
					if (a.wins !== b.wins) {
						return b.wins - a.wins; // DESC
					}
					if (a.losses !== b.losses) {
						return a.losses - b.losses; // ASC
					}
					return b.elo_change - a.elo_change; // DESC
				});

				result.doubles_team = teamsArray;
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
