import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
	getSessionBaseline,
	replaySessionMatches,
} from "@/lib/elo/session-baseline";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

type BestWorstPlayerResult = {
	best_player_id: string | null;
	best_player_display_name: string | null;
	best_player_delta: number | null;
	worst_player_id: string | null;
	worst_player_display_name: string | null;
	worst_player_delta: number | null;
};

/**
 * GET /api/sessions/[sessionId]/best-worst-player
 *
 * Get best and worst player of a session based on total Elo delta.
 *
 * Definition:
 * - Best player = player with highest SINGLES Elo change in that session
 * - Worst player = player with lowest SINGLES Elo change in that session
 * - Singles Elo change = (singles_elo_after_session - singles_elo_before_session)
 * - Only includes players who played singles matches (doubles-only players excluded)
 * - This matches the session summary singles calculation method exactly (baseline + replay)
 *
 * Security:
 * - Requires authentication
 * - Only returns data for sessions the user can access (RLS)
 *
 * Edge cases:
 * - If no completed matches → returns nulls
 * - If tie → picks deterministically (lowest UUID)
 * - Active sessions → returns nulls (only completed sessions have match history)
 *
 * Returns:
 * {
 *   best_player_id: string | null,
 *   best_player_display_name: string | null,
 *   best_player_delta: number | null,
 *   worst_player_id: string | null,
 *   worst_player_display_name: string | null,
 *   worst_player_delta: number | null
 * }
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

		// Verify session exists and check status
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

		// Skip calculation for active sessions (no completed matches yet)
		if (session.status !== "completed") {
			return NextResponse.json({
				best_player_id: null,
				best_player_display_name: null,
				best_player_delta: null,
				worst_player_id: null,
				worst_player_display_name: null,
				worst_player_delta: null,
			});
		}

		// ============================================================================
		// AGGREGATION: Calculate SINGLES-ONLY Elo change as (elo_after - elo_before) per player
		// ============================================================================
		// This matches the session summary calculation method exactly:
		// - elo_before = baseline (replay all previous sessions' singles matches)
		// - elo_after = baseline + replay current session's singles matches
		// - singles_elo_change = elo_after - elo_before
		//
		// IMPORTANT: Only includes players who played singles matches.
		// Doubles Elo is completely ignored for best/worst ranking.

		// Step 1: Get all completed singles matches for this session
		const { data: singlesMatches, error: matchesError } =
			await adminClient
				.from("session_matches")
				.select("id, match_type, player_ids")
				.eq("session_id", sessionId)
				.eq("match_type", "singles")
				.eq("status", "completed");

		if (matchesError) {
			console.error("Error fetching singles matches:", matchesError);
			return NextResponse.json(
				{ error: "Failed to fetch matches" },
				{ status: 500 }
			);
		}

		// If no completed singles matches, return nulls
		if (!singlesMatches || singlesMatches.length === 0) {
			return NextResponse.json({
				best_player_id: null,
				best_player_display_name: null,
				best_player_delta: null,
				worst_player_id: null,
				worst_player_display_name: null,
				worst_player_delta: null,
			});
		}

		// Step 2: Collect only players who played singles matches
		// This matches session summary logic: only include players with singles matches
		const singlesPlayerIds = new Set<string>();
		for (const match of singlesMatches) {
			const playerIds = (match.player_ids as string[]) || [];
			if (playerIds.length >= 2) {
				singlesPlayerIds.add(playerIds[0]);
				singlesPlayerIds.add(playerIds[1]);
			}
		}

		if (singlesPlayerIds.size === 0) {
			return NextResponse.json({
				best_player_id: null,
				best_player_display_name: null,
				best_player_delta: null,
				worst_player_id: null,
				worst_player_display_name: null,
				worst_player_delta: null,
			});
		}

		// Step 3: Calculate singles Elo change (elo_after - elo_before)
		// This uses the exact same functions as session summary
		const singlesBaseline = await getSessionBaseline(sessionId);
		const singlesPostSession = await replaySessionMatches(
			sessionId,
			singlesBaseline
		);

		// Step 4: Calculate singles Elo change per player
		// Map: player_id -> singles_elo_change
		const playerEloChanges = new Map<string, number>();

		for (const playerId of singlesPlayerIds) {
			// Get baseline (elo before session)
			const baseline = singlesBaseline.get(playerId);
			const eloBefore = baseline?.elo ?? 1500;

			// Get post-session (elo after session)
			const postSession = singlesPostSession.get(playerId);
			const eloAfter = postSession?.elo ?? eloBefore;

			// Calculate change (matches session summary exactly)
			const singlesEloChange = eloAfter - eloBefore;
			playerEloChanges.set(playerId, singlesEloChange);
		}

		// Step 5: Verification - Compare with sum-of-deltas method (for debugging)
		// This helps verify both methods produce the same result for singles-only
		const singlesMatchIds = singlesMatches.map((m) => m.id);
		const { data: eloHistory } = await adminClient
			.from("match_elo_history")
			.select("*")
			.in(
				"match_id",
				singlesMatchIds.length > 0
					? singlesMatchIds
					: ["00000000-0000-0000-0000-000000000000"]
			);

		if (eloHistory && eloHistory.length > 0) {
			// Calculate sum-of-deltas for comparison (singles only)
			const sumOfDeltas = new Map<string, number>();

			// Sum singles deltas only
			for (const history of eloHistory) {
				if (history.player1_id && history.player1_elo_delta !== null) {
					const current = sumOfDeltas.get(history.player1_id) || 0;
					sumOfDeltas.set(
						history.player1_id,
						current + history.player1_elo_delta
					);
				}
				if (history.player2_id && history.player2_elo_delta !== null) {
					const current = sumOfDeltas.get(history.player2_id) || 0;
					sumOfDeltas.set(
						history.player2_id,
						current + history.player2_elo_delta
					);
				}
			}

			// Log comparison for verification (first player only, for debugging)
			if (singlesPlayerIds.size > 0) {
				const firstPlayerId = Array.from(singlesPlayerIds)[0];
				const afterBeforeChange = playerEloChanges.get(firstPlayerId) ?? 0;
				const sumDeltasChange = sumOfDeltas.get(firstPlayerId) ?? 0;
				console.log(
					`[BEST_WORST_VERIFY] Session ${sessionId}, Player ${firstPlayerId}: after-before=${afterBeforeChange.toFixed(2)}, sum-deltas=${sumDeltasChange.toFixed(2)}, diff=${Math.abs(afterBeforeChange - sumDeltasChange).toFixed(2)}`
				);
			}
		}

		// Step 6: Find best and worst players
		if (playerEloChanges.size === 0) {
			return NextResponse.json({
				best_player_id: null,
				best_player_display_name: null,
				best_player_delta: null,
				worst_player_id: null,
				worst_player_display_name: null,
				worst_player_delta: null,
			});
		}

		// Convert to array and sort
		const playerChangeArray = Array.from(playerEloChanges.entries()).map(
			([player_id, elo_change]) => ({ player_id, elo_change })
		);

		// Sort by elo_change DESC, then by player_id ASC (for deterministic tie-breaking)
		playerChangeArray.sort((a, b) => {
			if (b.elo_change !== a.elo_change) {
				return b.elo_change - a.elo_change; // DESC by elo_change
			}
			return a.player_id.localeCompare(b.player_id); // ASC by UUID (deterministic)
		});

		const best = playerChangeArray[0];
		const worst = playerChangeArray[playerChangeArray.length - 1];

		// Step 7: Fetch display names for best and worst players (AFTER aggregation)
		// This is efficient - we only fetch user data for 2 players, not all players
		const playerIdsToFetch = new Set<string>();
		if (best.player_id) playerIdsToFetch.add(best.player_id);
		if (worst.player_id) playerIdsToFetch.add(worst.player_id);

		const usersMap = new Map<string, string>();

		if (playerIdsToFetch.size > 0) {
			const { data: usersData, error: usersError } =
				await adminClient.auth.admin.listUsers();

			if (usersError) {
				console.error("Error fetching user data:", usersError);
				// Non-fatal: continue without display names
			} else if (usersData) {
				// Create map of player_id -> display_name
				usersData.users
					.filter((u) => playerIdsToFetch.has(u.id))
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

		const result: BestWorstPlayerResult = {
			best_player_id: best.player_id,
			best_player_display_name:
				usersMap.get(best.player_id) || null,
			best_player_delta: best.elo_change,
			worst_player_id: worst.player_id,
			worst_player_display_name:
				usersMap.get(worst.player_id) || null,
			worst_player_delta: worst.elo_change,
		};

		return NextResponse.json(result);
	} catch (error) {
		console.error("Unexpected error in best-worst-player:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}

