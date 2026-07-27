import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthToken } from "../../_utils/auth";
import {
	detectTwoHalfSinglesSession,
	getEffectiveTwoHalfSinglesScore,
	type TwoHalfSinglesMatch,
} from "@/lib/sessions/two-half-singles";
import { buildEloHistoryMatchPerspective } from "@/lib/elo/history";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

/**
 * GET /api/player/elo-history
 *
 * Fetch Elo history for a player
 *
 * Query parameters:
 * - playerId (optional): Player ID to fetch history for. If not provided, uses the authenticated user's ID.
 *
 * Security:
 * - Requires authentication
 * - If playerId is provided, returns that player's Elo history
 * - If playerId is not provided, returns the current user's Elo history
 */
export async function GET(request: NextRequest) {
	try {
		// Get JWT token from Authorization header or X-Supabase-Token
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

		// Get optional playerId from query parameters
		const { searchParams } = new URL(request.url);
		const requestedPlayerId = searchParams.get("playerId")?.toLowerCase();

		// Use requested playerId if provided, otherwise use authenticated user's ID
		const userId = requestedPlayerId || user.id.toLowerCase();

		// Fetch all match Elo history entries where the user is player1_id or player2_id
		const { data: eloHistory, error: historyError } = await supabase
			.from("match_elo_history")
			.select("match_id, player1_id, player2_id, player1_elo_after, player2_elo_after, player1_elo_delta, player2_elo_delta, created_at")
			.or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
			.order("created_at", { ascending: true });

		if (historyError) {
			console.error("Error fetching Elo history:", historyError);
			return NextResponse.json(
				{ error: "Failed to fetch Elo history" },
				{ status: 500 }
			);
		}

		// Fetch all matches to get match ordering and session IDs
		const matchIds = (eloHistory || []).map((h) => h.match_id);
		const { data: matches, error: matchesError } = matchIds.length > 0
			? await supabase
					.from("session_matches")
					.select(
						"id, session_id, round_number, match_order, match_type, player_ids, team1_score, team2_score",
					)
					.in("id", matchIds)
			: { data: null, error: null };

		if (matchesError) {
			console.error("Error fetching matches:", matchesError);
		}

		// Create a map of match_id -> match for ordering
		const matchMap = new Map((matches || []).map((m) => [m.id, m]));

		// Fetch all player information for player names
		// Get player IDs directly from match_elo_history (player1_id and player2_id)
		const allPlayerIds = new Set<string>();
		(eloHistory || []).forEach((entry) => {
			if (entry.player1_id) allPlayerIds.add(entry.player1_id);
			if (entry.player2_id) allPlayerIds.add(entry.player2_id);
		});

		const usersMap = new Map<string, string>();
		if (allPlayerIds.size > 0) {
			const { data: profiles, error: profilesError } = await supabase
				.from("profiles")
				.select("id, display_name")
				.in("id", Array.from(allPlayerIds));

			if (profilesError) {
				console.error("Error fetching profiles:", profilesError);
			} else if (profiles) {
				profiles.forEach((profile) => {
					usersMap.set(profile.id, profile.display_name || "User");
				});
			}
		}

		// Fetch sessions to get session dates
		const sessionIds = [...new Set((matches || []).map((m) => m.session_id))];
		const { data: sessions, error: sessionsError } = sessionIds.length > 0
			? await supabase
					.from("sessions")
					.select("id, created_at, player_count")
					.in("id", sessionIds)
			: { data: null, error: null };

		if (sessionsError) {
			console.error("Error fetching sessions:", sessionsError);
		}

		// Create a map of session_id -> session date
		const sessionDateMap = new Map(
			(sessions || []).map((s) => [s.id, s.created_at])
		);
		const { data: allSessionMatches, error: allSessionMatchesError } =
			sessionIds.length > 0
				? await supabase
						.from("session_matches")
						.select(
							"id, session_id, round_number, match_order, match_type, player_ids, team1_score, team2_score",
						)
						.in("session_id", sessionIds)
				: { data: [], error: null };

		if (allSessionMatchesError) {
			console.error(
				"Error fetching paired session matches:",
				allSessionMatchesError,
			);
		}

		const matchesBySession = new Map<
			string,
			Array<TwoHalfSinglesMatch & { session_id: string }>
		>();
		for (const match of allSessionMatches || []) {
			const sessionMatches = matchesBySession.get(match.session_id) ?? [];
			sessionMatches.push(match);
			matchesBySession.set(match.session_id, sessionMatches);
		}
		const playerCountBySession = new Map(
			(sessions || []).map((session) => [session.id, session.player_count]),
		);

		// Get current Elo rating for the player
		const { data: currentRating } = await supabase
			.from("player_ratings")
			.select("elo")
			.eq("player_id", userId)
			.single();

		// Build data points for the chart - only include singles matches
		const dataPoints: Array<{
			match: number;
			elo: number;
			date: string;
			opponent: string;
			opponentId: string | null;
			delta: number;
			scoreFor: number | null;
			scoreAgainst: number | null;
			result: "win" | "loss" | "draw" | null;
		}> = [];

		if (eloHistory && eloHistory.length > 0) {
			// Filter to only singles matches and sort by match order
			const singlesEntries = eloHistory
				.filter((entry) => {
					const match = matchMap.get(entry.match_id);
					return match?.match_type === "singles";
				})
				.sort((a, b) => {
					const matchA = matchMap.get(a.match_id);
					const matchB = matchMap.get(b.match_id);
					if (!matchA || !matchB) return 0;
					if (matchA.session_id !== matchB.session_id) {
						// Different sessions - sort by created_at
						return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
					}
					if (matchA.round_number !== matchB.round_number) {
						return matchA.round_number - matchB.round_number;
					}
					return matchA.match_order - matchB.match_order;
				});

			let matchIndex = 0;
			for (const entry of singlesEntries) {
				const isPlayer1 = entry.player1_id === userId;
				const eloAfter = isPlayer1
					? entry.player1_elo_after
					: entry.player2_elo_after;
				const eloDelta = isPlayer1
					? entry.player1_elo_delta
					: entry.player2_elo_delta;

				if (eloAfter !== null && eloAfter !== undefined) {
					const eloNum =
						typeof eloAfter === "string"
							? parseFloat(eloAfter)
							: Number(eloAfter);

					const deltaNum =
						eloDelta !== null && eloDelta !== undefined
							? typeof eloDelta === "string"
								? parseFloat(eloDelta)
								: Number(eloDelta)
							: 0;

					const match = matchMap.get(entry.match_id);
					const sessionDate = match?.session_id
						? sessionDateMap.get(match.session_id) || entry.created_at
						: entry.created_at;

					// Get opponent name
					const opponentId = isPlayer1 ? entry.player2_id : entry.player1_id;
					const opponentName = opponentId ? usersMap.get(opponentId) || "Unknown" : "Unknown";
					const sessionMatches = match?.session_id
						? matchesBySession.get(match.session_id) || []
						: [];
					const aggregateConfig = match?.session_id
						? detectTwoHalfSinglesSession(
								playerCountBySession.get(match.session_id) ?? 0,
								sessionMatches,
							)
						: null;
					const effectiveScore = match
						? getEffectiveTwoHalfSinglesScore<TwoHalfSinglesMatch>(
								match as TwoHalfSinglesMatch,
								sessionMatches,
								aggregateConfig,
							)
						: null;
					const matchResult = buildEloHistoryMatchPerspective(
						isPlayer1,
						effectiveScore?.team1Score ?? match?.team1_score,
						effectiveScore?.team2Score ?? match?.team2_score,
					);

					dataPoints.push({
						match: matchIndex + 1,
						elo: eloNum,
						date: sessionDate,
						opponent: opponentName,
						opponentId,
						delta: deltaNum,
						...matchResult,
					});
					matchIndex++;
				}
			}
		}

		// If no matches, use current rating or default to 1500
		if (dataPoints.length === 0) {
			const currentElo =
				currentRating?.elo !== null && currentRating?.elo !== undefined
					? typeof currentRating.elo === "string"
						? parseFloat(currentRating.elo)
						: Number(currentRating.elo)
					: 1500;

			return NextResponse.json({
				data: [{ match: 0, elo: currentElo, date: new Date().toISOString() }],
				currentElo: currentElo,
			});
		}

		// Get current Elo (last point or from ratings table)
		const currentElo =
			dataPoints.length > 0
				? dataPoints[dataPoints.length - 1].elo
				: currentRating?.elo !== null && currentRating?.elo !== undefined
				? typeof currentRating.elo === "string"
					? parseFloat(currentRating.elo)
					: Number(currentRating.elo)
				: 1500;

		return NextResponse.json({
			data: dataPoints,
			currentElo: currentElo,
		});
	} catch (error) {
		console.error("Unexpected error in GET /api/player/elo-history:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
