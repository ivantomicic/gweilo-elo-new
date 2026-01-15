import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateSinglesRatings, updateDoublesRatings } from "@/lib/elo/updates";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

/**
 * POST /api/sessions/[sessionId]/matches/[matchId]/result
 *
 * Submit match result and update Elo ratings
 *
 * Request body:
 * {
 *   team1Score: number,
 *   team2Score: number
 * }
 */
export async function POST(
	request: NextRequest,
	{ params }: { params: { sessionId: string; matchId: string } }
) {
	try {
		const authHeader = request.headers.get("authorization");
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 }
			);
		}

		const token = authHeader.replace("Bearer ", "");
		const { sessionId, matchId } = params;

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
		const { team1Score, team2Score }: { team1Score: number; team2Score: number } = body;

		if (typeof team1Score !== "number" || typeof team2Score !== "number") {
			return NextResponse.json(
				{ error: "Invalid scores. team1Score and team2Score must be numbers" },
				{ status: 400 }
			);
		}

		// Fetch match data
		const { data: match, error: matchError } = await supabase
			.from("session_matches")
			.select("*")
			.eq("id", matchId)
			.eq("session_id", sessionId)
			.single();

		if (matchError || !match) {
			console.error("Error fetching match:", matchError);
			return NextResponse.json(
				{ error: "Match not found" },
				{ status: 404 }
			);
		}

		const isSingles = match.match_type === "singles";
		const playerIds = match.player_ids as string[];

		if (isSingles && playerIds.length !== 2) {
			return NextResponse.json(
				{ error: "Invalid match data: singles match must have 2 players" },
				{ status: 400 }
			);
		}

		if (!isSingles && playerIds.length !== 4) {
			return NextResponse.json(
				{ error: "Invalid match data: doubles match must have 4 players" },
				{ status: 400 }
			);
		}

		// Update Elo ratings based on match type
		if (isSingles) {
			await updateSinglesRatings(playerIds[0], playerIds[1], team1Score, team2Score);
		} else {
			// Doubles: team1 = [playerIds[0], playerIds[1]], team2 = [playerIds[2], playerIds[3]]
			await updateDoublesRatings(
				[playerIds[0], playerIds[1]],
				[playerIds[2], playerIds[3]],
				team1Score,
				team2Score
			);
		}

		// Success - return updated Elo deltas (could be calculated and returned here if needed)
		return NextResponse.json({
			success: true,
			message: "Match result submitted and ratings updated",
		});
	} catch (error) {
		console.error("Unexpected error in POST /api/sessions/[sessionId]/matches/[matchId]/result:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}

