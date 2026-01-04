// TEMPORARY JSON IMPORT – safe to remove after migration

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient, verifyAdmin } from "@/lib/supabase/admin";
import { updateSinglesRatings, updateDoublesRatings } from "@/lib/elo/updates";
import { createEloSnapshots } from "@/lib/elo/snapshots";
import { getOrCreateDoubleTeam } from "@/lib/elo/double-teams";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

type ParsedMatch = {
	type: "singles" | "doubles";
	playerIds: string[];
	score1: number;
	score2: number;
	matchIndex: number;
	roundNumber: number;
	matchOrder: number;
};

type ParsedSession = {
	startedAt: string;
	endedAt: string;
	matches: ParsedMatch[];
	playerCount: number;
};

/**
 * POST /api/sessions/import-json
 *
 * Import a session from JSON (admin-only)
 *
 * This endpoint:
 * - Creates session with started_at/ended_at and status=completed
 * - Creates matches with scores and status=completed
 * - Processes Elo updates for each match (reusing existing logic)
 * - Creates Elo snapshots
 *
 * Security:
 * - Admin-only access
 * - Uses existing Elo calculation logic (no bypass)
 */
export async function POST(request: NextRequest) {
	try {
		// Verify admin access
		const authHeader = request.headers.get("authorization");
		const userId = await verifyAdmin(authHeader);

		if (!userId) {
			return NextResponse.json(
				{ error: "Unauthorized. Admin access required." },
				{ status: 401 }
			);
		}

		// Parse request body
		const body = await request.json();
		const parsedSession: ParsedSession = body;

		// Validate required fields
		if (!parsedSession.startedAt || !parsedSession.endedAt) {
			return NextResponse.json(
				{ error: "startedAt and endedAt are required" },
				{ status: 400 }
			);
		}

		if (!parsedSession.matches || parsedSession.matches.length === 0) {
			return NextResponse.json(
				{ error: "matches array cannot be empty" },
				{ status: 400 }
			);
		}

		const adminClient = createAdminClient();
		const supabase = createClient(supabaseUrl, supabaseAnonKey, {
			global: {
				headers: {
					Authorization: authHeader || "",
				},
			},
		});

		// Step 1: Create session with status=completed
		// Map started_at → created_at, ended_at → completed_at
		const { data: session, error: sessionError } = await supabase
			.from("sessions")
			.insert({
				player_count: parsedSession.playerCount,
				created_by: userId,
				created_at: parsedSession.startedAt,
				completed_at: parsedSession.endedAt,
				status: "completed",
			})
			.select()
			.single();

		if (sessionError) {
			console.error("Error creating session:", sessionError);
			return NextResponse.json(
				{ error: "Failed to create session" },
				{ status: 500 }
			);
		}

		const sessionId = session.id;

		// Step 2: Get unique player IDs and create session_players
		const uniquePlayerIds = new Set<string>();
		parsedSession.matches.forEach((match) => {
			match.playerIds.forEach((id) => uniquePlayerIds.add(id));
		});

		const sessionPlayersData = Array.from(uniquePlayerIds).map((playerId) => ({
			session_id: sessionId,
			player_id: playerId,
			team: null, // Singles mode (or we could infer from player count)
		}));

		const { error: playersError } = await supabase
			.from("session_players")
			.insert(sessionPlayersData);

		if (playersError) {
			console.error("Error inserting session players:", playersError);
			await supabase.from("sessions").delete().eq("id", sessionId);
			return NextResponse.json(
				{ error: "Failed to create session players" },
				{ status: 500 }
			);
		}

		// Step 3: Create/get double teams for doubles matches
		const teamMap = new Map<string, string>();

		for (const match of parsedSession.matches) {
			if (match.type === "doubles" && match.playerIds.length === 4) {
				// Team 1: playerIds[0] + playerIds[1]
				// Team 2: playerIds[2] + playerIds[3]
				const team1Key =
					match.playerIds[0] < match.playerIds[1]
						? `${match.playerIds[0]}-${match.playerIds[1]}`
						: `${match.playerIds[1]}-${match.playerIds[0]}`;
				const team2Key =
					match.playerIds[2] < match.playerIds[3]
						? `${match.playerIds[2]}-${match.playerIds[3]}`
						: `${match.playerIds[3]}-${match.playerIds[2]}`;

				if (!teamMap.has(team1Key)) {
					try {
						const teamId = await getOrCreateDoubleTeam(
							match.playerIds[0],
							match.playerIds[1]
						);
						teamMap.set(team1Key, teamId);
					} catch (error) {
						console.error("Error creating double team:", error);
						await supabase.from("sessions").delete().eq("id", sessionId);
						return NextResponse.json(
							{ error: "Failed to create double teams" },
							{ status: 500 }
						);
					}
				}

				if (!teamMap.has(team2Key)) {
					try {
						const teamId = await getOrCreateDoubleTeam(
							match.playerIds[2],
							match.playerIds[3]
						);
						teamMap.set(team2Key, teamId);
					} catch (error) {
						console.error("Error creating double team:", error);
						await supabase.from("sessions").delete().eq("id", sessionId);
						return NextResponse.json(
							{ error: "Failed to create double teams" },
							{ status: 500 }
						);
					}
				}
			}
		}

		// Step 4: Insert matches with scores and status=completed
		const allMatchesData: Array<{
			session_id: string;
			round_number: number;
			match_type: string;
			match_order: number;
			player_ids: string[];
			team_1_id?: string | null;
			team_2_id?: string | null;
			team1_score: number;
			team2_score: number;
			status: string;
		}> = [];

		for (const match of parsedSession.matches) {
			const matchData: {
				session_id: string;
				round_number: number;
				match_type: string;
				match_order: number;
				player_ids: string[];
				team_1_id?: string | null;
				team_2_id?: string | null;
				team1_score: number;
				team2_score: number;
				status: string;
			} = {
				session_id: sessionId,
				round_number: match.roundNumber,
				match_type: match.type,
				match_order: match.matchOrder,
				player_ids: match.playerIds,
				team1_score: match.score1,
				team2_score: match.score2,
				status: "completed",
			};

			// For doubles matches, add team IDs
			if (match.type === "doubles" && match.playerIds.length === 4) {
				const team1Key =
					match.playerIds[0] < match.playerIds[1]
						? `${match.playerIds[0]}-${match.playerIds[1]}`
						: `${match.playerIds[1]}-${match.playerIds[0]}`;
				const team2Key =
					match.playerIds[2] < match.playerIds[3]
						? `${match.playerIds[2]}-${match.playerIds[3]}`
						: `${match.playerIds[3]}-${match.playerIds[2]}`;

				matchData.team_1_id = teamMap.get(team1Key) || null;
				matchData.team_2_id = teamMap.get(team2Key) || null;
			}

			allMatchesData.push(matchData);
		}

		const { data: insertedMatches, error: matchesError } = await adminClient
			.from("session_matches")
			.insert(allMatchesData)
			.select();

		if (matchesError || !insertedMatches) {
			console.error("Error inserting matches:", matchesError);
			await supabase.from("sessions").delete().eq("id", sessionId);
			return NextResponse.json(
				{ error: "Failed to create matches" },
				{ status: 500 }
			);
		}

		// Step 5: Process Elo updates for each match (reusing existing logic)
		// Process matches in order to maintain correct Elo progression
		const eloHistoryEntries: Array<{
			match_id: string;
			player1_id?: string;
			player2_id?: string;
			player1_elo_before?: number;
			player1_elo_after?: number;
			player1_elo_delta?: number;
			player2_elo_before?: number;
			player2_elo_after?: number;
			player2_elo_delta?: number;
			team1_id?: string;
			team2_id?: string;
			team1_elo_before?: number;
			team1_elo_after?: number;
			team1_elo_delta?: number;
			team2_elo_before?: number;
			team2_elo_after?: number;
			team2_elo_delta?: number;
		}> = [];

		for (const match of insertedMatches) {
			const parsedMatch = parsedSession.matches.find(
				(m) =>
					m.roundNumber === match.round_number &&
					m.matchOrder === match.match_order
			);

			if (!parsedMatch) continue;

			if (match.match_type === "singles") {
				// Process singles match
				const player1Id = match.player_ids[0];
				const player2Id = match.player_ids[1];

				// Get current Elo ratings before update (for history)
				const { data: rating1 } = await adminClient
					.from("player_ratings")
					.select("elo")
					.eq("player_id", player1Id)
					.single();
				const { data: rating2 } = await adminClient
					.from("player_ratings")
					.select("elo")
					.eq("player_id", player2Id)
					.single();

				const player1EloBefore = rating1?.elo ?? 1500;
				const player2EloBefore = rating2?.elo ?? 1500;

				// Determine result
				const player1Result: "win" | "loss" | "draw" =
					match.team1_score > match.team2_score
						? "win"
						: match.team1_score < match.team2_score
						? "loss"
						: "draw";

				// Update Elo ratings (reusing existing logic)
				try {
					await updateSinglesRatings(
						player1Id,
						player2Id,
						match.team1_score,
						match.team2_score
					);
				} catch (error) {
					console.error(
						`Error updating Elo for match ${match.id}:`,
						error
					);
					// Continue processing other matches even if one fails
					continue;
				}

				// Get updated ratings for history
				const { data: rating1After } = await adminClient
					.from("player_ratings")
					.select("elo")
					.eq("player_id", player1Id)
					.single();
				const { data: rating2After } = await adminClient
					.from("player_ratings")
					.select("elo")
					.eq("player_id", player2Id)
					.single();

				const player1EloAfter = rating1After?.elo ?? player1EloBefore;
				const player2EloAfter = rating2After?.elo ?? player2EloBefore;

				eloHistoryEntries.push({
					match_id: match.id,
					player1_id: player1Id,
					player2_id: player2Id,
					player1_elo_before: player1EloBefore,
					player1_elo_after: player1EloAfter,
					player1_elo_delta: player1EloAfter - player1EloBefore,
					player2_elo_before: player2EloBefore,
					player2_elo_after: player2EloAfter,
					player2_elo_delta: player2EloAfter - player2EloBefore,
				});

				// Create Elo snapshots
				try {
					await createEloSnapshots(match.id, [player1Id, player2Id], "singles");
				} catch (error) {
					console.error(
						`Error creating snapshots for match ${match.id}:`,
						error
					);
					// Non-fatal: log but continue
				}
			} else if (match.match_type === "doubles") {
				// Process doubles match
				const team1Id = match.team_1_id;
				const team2Id = match.team_2_id;

				if (!team1Id || !team2Id) {
					console.error(
						`Missing team IDs for doubles match ${match.id}`
					);
					continue;
				}

				// Get current Elo ratings before update (for history)
				const { data: team1Rating } = await adminClient
					.from("double_team_ratings")
					.select("elo")
					.eq("team_id", team1Id)
					.single();
				const { data: team2Rating } = await adminClient
					.from("double_team_ratings")
					.select("elo")
					.eq("team_id", team2Id)
					.single();

				const team1EloBefore = team1Rating?.elo ?? 1500;
				const team2EloBefore = team2Rating?.elo ?? 1500;

				// Determine result
				const team1Result: "win" | "loss" | "draw" =
					match.team1_score > match.team2_score
						? "win"
						: match.team1_score < match.team2_score
						? "loss"
						: "draw";

				// Update Elo ratings (reusing existing logic)
				// Note: updateDoublesRatings takes player IDs, not team IDs
				try {
					await updateDoublesRatings(
						[match.player_ids[0], match.player_ids[1]],
						[match.player_ids[2], match.player_ids[3]],
						match.team1_score,
						match.team2_score
					);
				} catch (error) {
					console.error(
						`Error updating Elo for match ${match.id}:`,
						error
					);
					// Continue processing other matches even if one fails
					continue;
				}

				// Get updated ratings for history
				const { data: team1RatingAfter } = await adminClient
					.from("double_team_ratings")
					.select("elo")
					.eq("team_id", team1Id)
					.single();
				const { data: team2RatingAfter } = await adminClient
					.from("double_team_ratings")
					.select("elo")
					.eq("team_id", team2Id)
					.single();

				const team1EloAfter = team1RatingAfter?.elo ?? team1EloBefore;
				const team2EloAfter = team2RatingAfter?.elo ?? team2EloBefore;

				eloHistoryEntries.push({
					match_id: match.id,
					team1_id: team1Id,
					team2_id: team2Id,
					team1_elo_before: team1EloBefore,
					team1_elo_after: team1EloAfter,
					team1_elo_delta: team1EloAfter - team1EloBefore,
					team2_elo_before: team2EloBefore,
					team2_elo_after: team2EloAfter,
					team2_elo_delta: team2EloAfter - team2EloBefore,
				});

				// Create Elo snapshots (for all 4 players)
				try {
					await createEloSnapshots(
						match.id,
						match.player_ids,
						"doubles"
					);
				} catch (error) {
					console.error(
						`Error creating snapshots for match ${match.id}:`,
						error
					);
					// Non-fatal: log but continue
				}
			}
		}

		// Step 6: Insert Elo history records
		if (eloHistoryEntries.length > 0) {
			const { error: historyError } = await adminClient
				.from("match_elo_history")
				.insert(eloHistoryEntries);

			if (historyError) {
				console.error("Error inserting Elo history:", historyError);
				// Non-fatal: log but don't fail the import
			}
		}

		// Success - return session ID
		return NextResponse.json(
			{
				sessionId: sessionId,
				message: "Session imported successfully",
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error("Unexpected error in POST /api/sessions/import-json:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}

