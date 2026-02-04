import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthToken } from "../../../_utils/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPlayersWithRatings } from "@/lib/elo/fetch-ratings";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

/**
 * GET /api/player/[playerId]/head-to-head
 *
 * Fetch head-to-head statistics between two players
 *
 * Query parameters:
 * - opponentId: The ID of the opponent player (required)
 *
 * Security:
 * - Requires authentication
 * - Returns head-to-head stats for singles matches only
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: { playerId: string } }
) {
	try {
		// Get JWT token from Authorization header
		const token = getAuthToken(request);
		if (!token) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 }
			);
		}

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

		const playerId = params.playerId;
		const { searchParams } = new URL(request.url);
		const opponentId = searchParams.get("opponentId");

		if (!opponentId) {
			return NextResponse.json(
				{ error: "opponentId query parameter is required" },
				{ status: 400 }
			);
		}

		if (playerId === opponentId) {
			return NextResponse.json(
				{ error: "Player and opponent cannot be the same" },
				{ status: 400 }
			);
		}

		const adminClient = createAdminClient();

		// Fetch both players' data with ratings
		const players = await fetchPlayersWithRatings(
			adminClient,
			[playerId, opponentId],
			false
		);

		if (players.length !== 2) {
			return NextResponse.json(
				{ error: "One or both players not found" },
				{ status: 404 }
			);
		}

		const player1 = players.find((p) => p.player_id === playerId);
		const player2 = players.find((p) => p.player_id === opponentId);

		if (!player1 || !player2) {
			return NextResponse.json(
				{ error: "One or both players not found" },
				{ status: 404 }
			);
		}

		// Fetch all singles matches where both players played against each other
		// Query match_elo_history for matches where player1_id and player2_id are these two players
		const { data: headToHeadHistory, error: historyError } =
			await adminClient
				.from("match_elo_history")
				.select(
					"match_id, player1_id, player2_id, player1_elo_delta, player2_elo_delta"
				)
				.or(
					`and(player1_id.eq.${playerId},player2_id.eq.${opponentId}),and(player1_id.eq.${opponentId},player2_id.eq.${playerId})`
				)
				.order("created_at", { ascending: false });

		if (historyError) {
			console.error("Error fetching head-to-head history:", historyError);
			return NextResponse.json(
				{ error: "Failed to fetch head-to-head statistics" },
				{ status: 500 }
			);
		}

		// Get match IDs and fetch match types and scores to filter for singles only and calculate sets
		const matchIds = (headToHeadHistory || []).map((h) => h.match_id);
		const { data: matches, error: matchesError } = matchIds.length > 0
			? await adminClient
					.from("session_matches")
					.select("id, match_type, team1_score, team2_score, player_ids")
					.in("id", matchIds)
			: { data: null, error: null };

		if (matchesError) {
			console.error("Error fetching matches:", matchesError);
			return NextResponse.json(
				{ error: "Failed to fetch match information" },
				{ status: 500 }
			);
		}

		// Create a map of match_id -> match data for filtering and sets calculation
		const matchDataMap = new Map(
			(matches || []).map((m) => [m.id, m])
		);

		// Filter to only singles matches
		const headToHeadMatches = (headToHeadHistory || []).filter(
			(entry) => matchDataMap.get(entry.match_id)?.match_type === "singles"
		);

		if (matchesError) {
			console.error("Error fetching head-to-head matches:", matchesError);
			return NextResponse.json(
				{ error: "Failed to fetch head-to-head statistics" },
				{ status: 500 }
			);
		}

		// Calculate statistics
		let player1Wins = 0;
		let player2Wins = 0;
		let draws = 0;
		let player1SetsWon = 0;
		let player2SetsWon = 0;

		// Determine winner based on Elo delta (positive delta = win, negative = loss)
		// Also calculate sets won/lost from match scores
		for (const match of headToHeadMatches || []) {
			const matchData = matchDataMap.get(match.match_id);
			if (!matchData) continue;

			const team1Score = matchData.team1_score ?? 0;
			const team2Score = matchData.team2_score ?? 0;
			const playerIds = (matchData.player_ids as string[]) || [];

			// For singles matches:
			// - player_ids[0] is team1 (player1_id in match_elo_history)
			// - player_ids[1] is team2 (player2_id in match_elo_history)
			// - team1_score is sets won by player_ids[0]
			// - team2_score is sets won by player_ids[1]

			if (match.player1_id === playerId) {
				// Viewed player was player1_id (team1, player_ids[0])
				if (match.player1_elo_delta > 0) {
					player1Wins++;
				} else if (match.player1_elo_delta < 0) {
					player2Wins++;
				} else {
					draws++;
				}
				player1SetsWon += team1Score;
				player2SetsWon += team2Score;
			} else {
				// Viewed player was player2_id (team2, player_ids[1])
				if (match.player2_elo_delta > 0) {
					player1Wins++;
				} else if (match.player2_elo_delta < 0) {
					player2Wins++;
				} else {
					draws++;
				}
				player1SetsWon += team2Score;
				player2SetsWon += team1Score;
			}
		}

		const totalMatches = (headToHeadMatches || []).length;

		return NextResponse.json({
			player1: {
				id: player1.player_id,
				display_name: player1.display_name,
				avatar: player1.avatar,
				elo: player1.singles_elo,
				wins: player1Wins,
				losses: player2Wins,
				draws: draws,
				setsWon: player1SetsWon,
				setsLost: player2SetsWon,
			},
			player2: {
				id: player2.player_id,
				display_name: player2.display_name,
				avatar: player2.avatar,
				elo: player2.singles_elo,
				wins: player2Wins,
				losses: player1Wins,
				draws: draws,
				setsWon: player2SetsWon,
				setsLost: player1SetsWon,
			},
			totalMatches,
		});
	} catch (error) {
		console.error("Unexpected error in GET /api/player/[playerId]/head-to-head:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
