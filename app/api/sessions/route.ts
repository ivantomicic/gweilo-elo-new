import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getOrCreateDoubleTeam } from "@/lib/elo/double-teams";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

type Player = {
	id: string;
	name: string;
	avatar: string | null;
};

type Match = {
	type: "singles" | "doubles";
	players: Player[];
};

type Round = {
	id: string;
	roundNumber: number;
	matches: Match[];
	restingPlayers?: Player[];
};

/**
 * POST /api/sessions
 *
 * Create a new session with players and matches
 *
 * Security:
 * - Requires authentication
 * - RLS policies enforce that users can only create sessions they own
 *
 * Request body:
 * {
 *   playerCount: number,
 *   players: Player[],
 *   rounds: Round[],
 *   createdAt?: string (ISO 8601 timestamp, optional)
 * }
 */
export async function POST(request: NextRequest) {
	try {
		// Get JWT token from Authorization header
		const authHeader = request.headers.get("authorization");
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 }
			);
		}

		const token = authHeader.replace("Bearer ", "");

		// Create Supabase client with user's JWT token (so RLS works correctly)
		const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
			global: {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		});

		// Verify user is authenticated
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

		// Parse request body
		const body = await request.json();
		const { playerCount, players, rounds, createdAt }: { playerCount: number; players: Player[]; rounds: Round[]; createdAt?: string } = body;

		// Validate required fields
		if (!playerCount || !players || !rounds) {
			return NextResponse.json(
				{ error: "Missing required fields: playerCount, players, and rounds are required" },
				{ status: 400 }
			);
		}

		if (players.length !== playerCount) {
			return NextResponse.json(
				{ error: "Player count mismatch: players array length does not match playerCount" },
				{ status: 400 }
			);
		}

		if (rounds.length === 0) {
			return NextResponse.json(
				{ error: "Rounds array cannot be empty" },
				{ status: 400 }
			);
		}

		// Determine team assignments for doubles mode (6 players)
		// Teams are assigned based on selection order: first 2 = A, next 2 = B, last 2 = C
		const getTeamForPlayer = (playerIndex: number): string | null => {
			if (playerCount !== 6) return null;
			if (playerIndex < 2) return "A";
			if (playerIndex < 4) return "B";
			return "C";
		};

		// Step 1: Create session
		const sessionData: {
			player_count: number;
			created_by: string;
			created_at?: string;
		} = {
			player_count: playerCount,
			created_by: user.id,
		};

		// If createdAt is provided, use it (otherwise database will use DEFAULT NOW())
		if (createdAt) {
			sessionData.created_at = createdAt;
		}

		const { data: session, error: sessionError } = await supabase
			.from("sessions")
			.insert(sessionData)
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

		// Step 2: Insert session players
		const sessionPlayersData = players.map((player, index) => ({
			session_id: sessionId,
			player_id: player.id,
			team: getTeamForPlayer(index),
		}));

		const { error: playersError } = await supabase
			.from("session_players")
			.insert(sessionPlayersData);

		if (playersError) {
			console.error("Error inserting session players:", playersError);
			// Clean up session if players insert fails
			await supabase.from("sessions").delete().eq("id", sessionId);
			return NextResponse.json(
				{ error: "Failed to create session players" },
				{ status: 500 }
			);
		}

		// Step 3: Create/get double teams for 6-player sessions (if needed)
		const teamMap = new Map<string, string>(); // Maps "player1_id-player2_id" to team_id

		if (playerCount === 6) {
			// For 6-player sessions, create/get teams for all doubles matches
			// Teams are: [0,1], [2,3], [4,5]
			const teamPairs = [
				[players[0].id, players[1].id],
				[players[2].id, players[3].id],
				[players[4].id, players[5].id],
			];

			for (const [p1, p2] of teamPairs) {
				const teamKey = p1 < p2 ? `${p1}-${p2}` : `${p2}-${p1}`;
				if (!teamMap.has(teamKey)) {
					try {
						const teamId = await getOrCreateDoubleTeam(p1, p2);
						teamMap.set(teamKey, teamId);
					} catch (error) {
						console.error("Error creating double team:", error);
						// Clean up session
						await supabase.from("sessions").delete().eq("id", sessionId);
						return NextResponse.json(
							{ error: "Failed to create double teams" },
							{ status: 500 }
						);
					}
				}
			}
		}

		// Step 4: Insert matches directly (no rounds table needed)
		// Flatten all matches from all rounds into a single array
		const allMatchesData: Array<{
			session_id: string;
			round_number: number;
			match_type: string;
			match_order: number;
			player_ids: string[];
			team_1_id?: string | null;
			team_2_id?: string | null;
		}> = [];

		for (const round of rounds) {
			for (let matchIndex = 0; matchIndex < round.matches.length; matchIndex++) {
				const match = round.matches[matchIndex];
				const playerIds = match.players.map((p) => p.id);

				const matchData: {
					session_id: string;
					round_number: number;
					match_type: string;
					match_order: number;
					player_ids: string[];
					team_1_id?: string | null;
					team_2_id?: string | null;
				} = {
					session_id: sessionId,
					round_number: round.roundNumber,
					match_type: match.type,
					match_order: matchIndex,
					player_ids: playerIds,
				};

				// For doubles matches, add team IDs
				if (match.type === "doubles" && playerIds.length === 4) {
					// Team 1: playerIds[0] + playerIds[1]
					// Team 2: playerIds[2] + playerIds[3]
					const team1Key =
						playerIds[0] < playerIds[1]
							? `${playerIds[0]}-${playerIds[1]}`
							: `${playerIds[1]}-${playerIds[0]}`;
					const team2Key =
						playerIds[2] < playerIds[3]
							? `${playerIds[2]}-${playerIds[3]}`
							: `${playerIds[3]}-${playerIds[2]}`;

					// Get or create teams for doubles matches
					try {
						// Check cache first
						let team1Id = teamMap.get(team1Key);
						let team2Id = teamMap.get(team2Key);

						// Create if not in cache
						if (!team1Id) {
							team1Id = await getOrCreateDoubleTeam(playerIds[0], playerIds[1]);
							teamMap.set(team1Key, team1Id);
						}
						if (!team2Id) {
							team2Id = await getOrCreateDoubleTeam(playerIds[2], playerIds[3]);
							teamMap.set(team2Key, team2Id);
						}

						matchData.team_1_id = team1Id;
						matchData.team_2_id = team2Id;
					} catch (error) {
						console.error("Error creating double team for match:", error);
						// Clean up session
						await supabase.from("sessions").delete().eq("id", sessionId);
						return NextResponse.json(
							{ error: "Failed to create double teams for match" },
							{ status: 500 }
						);
					}
				}

				allMatchesData.push(matchData);
			}
		}

		const { error: matchesError } = await supabase
			.from("session_matches")
			.insert(allMatchesData);

		if (matchesError) {
			console.error("Error inserting matches:", matchesError);
			// Clean up on error (cascade deletes will handle related records)
			await supabase.from("sessions").delete().eq("id", sessionId);
			return NextResponse.json(
				{ error: "Failed to create matches" },
				{ status: 500 }
			);
		}

		// Success - return session ID
		return NextResponse.json(
			{
				sessionId: sessionId,
				message: "Session created successfully",
			},
			{ status: 201 }
		);
	} catch (error) {
		console.error("Unexpected error in POST /api/sessions:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
