import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
 *   rounds: Round[]
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
		const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
		const { playerCount, players, rounds }: { playerCount: number; players: Player[]; rounds: Round[] } = body;

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
		const { data: session, error: sessionError } = await supabase
			.from("sessions")
			.insert({
				player_count: playerCount,
				created_by: user.id,
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

		// Step 3: Insert matches directly (no rounds table needed)
		// Flatten all matches from all rounds into a single array
		const allMatchesData: Array<{
			session_id: string;
			round_number: number;
			match_type: string;
			match_order: number;
			player_ids: string[];
		}> = [];

		for (const round of rounds) {
			for (let matchIndex = 0; matchIndex < round.matches.length; matchIndex++) {
				const match = round.matches[matchIndex];
				allMatchesData.push({
					session_id: sessionId,
					round_number: round.roundNumber,
					match_type: match.type,
					match_order: matchIndex,
					player_ids: match.players.map((p) => p.id), // Extract player IDs in order
				});
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
