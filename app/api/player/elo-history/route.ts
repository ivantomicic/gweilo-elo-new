import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

/**
 * GET /api/player/elo-history
 *
 * Fetch Elo history for the currently logged-in player
 *
 * Security:
 * - Requires authentication
 * - Returns only the current user's Elo history
 */
export async function GET(request: NextRequest) {
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

		const userId = user.id;
		const adminClient = createAdminClient();

		// Fetch all match Elo history entries where the user is player1_id or player2_id
		const { data: eloHistory, error: historyError } = await adminClient
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
			? await adminClient
					.from("session_matches")
					.select("id, session_id, round_number, match_order, match_type")
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
			const { data: usersData, error: usersError } =
				await adminClient.auth.admin.listUsers();

			if (usersError) {
				console.error("Error fetching users:", usersError);
			} else if (usersData) {
				usersData.users
					.filter((u) => allPlayerIds.has(u.id))
					.forEach((user) => {
						const displayName =
							user.user_metadata?.name ||
							user.user_metadata?.display_name ||
							user.email?.split("@")[0] ||
							"User";
						usersMap.set(user.id, displayName);
					});
			}
		}

		// Fetch sessions to get session dates
		const sessionIds = [...new Set((matches || []).map((m) => m.session_id))];
		const { data: sessions, error: sessionsError } = sessionIds.length > 0
			? await adminClient
					.from("sessions")
					.select("id, created_at")
					.in("id", sessionIds)
			: { data: null, error: null };

		if (sessionsError) {
			console.error("Error fetching sessions:", sessionsError);
		}

		// Create a map of session_id -> session date
		const sessionDateMap = new Map(
			(sessions || []).map((s) => [s.id, s.created_at])
		);

		// Get current Elo rating for the player
		const { data: currentRating } = await adminClient
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
			delta: number;
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

					dataPoints.push({
						match: matchIndex + 1,
						elo: eloNum,
						date: sessionDate,
						opponent: opponentName,
						delta: deltaNum,
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
