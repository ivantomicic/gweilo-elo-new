import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPlayersWithRatings } from "@/lib/elo/fetch-ratings";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

/**
 * GET /api/sessions/[sessionId]/players
 *
 * Fetch session players with user details, Elo ratings, and match counts
 *
 * Security:
 * - Requires authentication
 * - RLS policies enforce read access
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: { sessionId: string } }
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
		const sessionId = params.sessionId;

		const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
			global: {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		});

		// Fetch session players
		const { data: sessionPlayers, error: playersError } = await supabase
			.from("session_players")
			.select("id, player_id, team")
			.eq("session_id", sessionId);

		if (playersError) {
			console.error("Error fetching session players:", playersError);
			return NextResponse.json(
				{ error: "Failed to fetch session players" },
				{ status: 500 }
			);
		}

		if (!sessionPlayers || sessionPlayers.length === 0) {
			return NextResponse.json({ players: [] });
		}

		// Extract player IDs
		const playerIds = sessionPlayers.map((sp) => sp.player_id);

		// Fetch players with ratings using the reusable helper
		// Use admin client to access auth.users and ratings tables
		// Include doubles Elo for display in live session doubles matches
		const adminClient = createAdminClient();
		const playersWithRatings = await fetchPlayersWithRatings(
			adminClient,
			playerIds,
			true,
		);

		// Fetch match counts for accurate K-factor calculation
		const { data: singlesRatings, error: ratingsError } = await adminClient
			.from("player_ratings")
			.select("player_id, wins, losses, draws")
			.in("player_id", playerIds);

		if (ratingsError) {
			console.error("Error fetching match counts:", ratingsError);
			// Non-fatal error, continue without match counts
		}

		// Create maps for quick lookup
		const ratingsMap = new Map(
			playersWithRatings.map((p) => [p.player_id, p])
		);
		const matchCountMap = new Map(
			(singlesRatings || []).map((r) => [
				r.player_id,
				(r.wins || 0) + (r.losses || 0) + (r.draws || 0),
			])
		);

		// Combine session player data with user details, ratings, and match counts
		const playersWithDetails = sessionPlayers.map((sp) => {
			const playerData = ratingsMap.get(sp.player_id);
			const matchCount = matchCountMap.get(sp.player_id) || 0;

			return {
				id: sp.player_id,
				sessionPlayerId: sp.id,
				team: sp.team,
				name: playerData?.display_name || "User",
				avatar: playerData?.avatar || null,
				elo: playerData?.singles_elo ?? 1500, // Default to 1500 if no rating exists
				doublesElo: playerData?.doubles_elo ?? 1500, // Player doubles Elo (partner-independent skill)
				matchCount, // For accurate K-factor calculation in UI previews
			};
		});

		return NextResponse.json({ players: playersWithDetails });
	} catch (error) {
		console.error(
			"Unexpected error in GET /api/sessions/[sessionId]/players:",
			error,
		);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
