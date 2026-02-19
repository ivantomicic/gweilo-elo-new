import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
	getLatestTwoCompletedSessions,
	computeRankMovements,
} from "@/lib/elo/rank-movements";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

/**
 * GET /api/statistics
 *
 * Fetch player statistics (singles, doubles players, doubles teams)
 *
 * Query parameters:
 * - view (optional): "singles" | "doubles_player" | "doubles_team" | "all"
 *   If not provided or "all", returns all statistics.
 *   If a specific view is provided, returns only that view's data.
 *
 * Security:
 * - Requires authentication
 * - Returns all players/teams with ratings (public statistics)
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

		// Get view parameter from query string
		const { searchParams } = new URL(request.url);
		const view = searchParams.get("view") || "all";
		const shouldFetchSingles = view === "all" || view === "singles";
		const shouldFetchDoublesPlayer = view === "all" || view === "doubles_player";
		const shouldFetchDoublesTeam = view === "all" || view === "doubles_team";


		// Fetch statistics in parallel for better performance
		const [singlesResult, doublesPlayerResult, doublesTeamResult] = await Promise.all([
			shouldFetchSingles
				? supabase
						.from("player_ratings")
						.select("*")
						.order("elo", { ascending: false })
				: Promise.resolve({ data: null, error: null }),
			shouldFetchDoublesPlayer
				? supabase
						.from("player_double_ratings")
						.select("*")
						.order("elo", { ascending: false })
				: Promise.resolve({ data: null, error: null }),
			shouldFetchDoublesTeam
				? supabase
						.from("double_team_ratings")
						.select("*")
						.order("elo", { ascending: false })
				: Promise.resolve({ data: null, error: null }),
		]);

		const { data: singlesRatings, error: singlesError } = singlesResult;
		const { data: doublesPlayerRatings, error: doublesPlayerError } = doublesPlayerResult;
		const { data: doublesTeamRatings, error: doublesTeamRatingsError } = doublesTeamResult;

		if (singlesError) {
			console.error("Error fetching singles ratings:", singlesError);
			return NextResponse.json(
				{ error: "Failed to fetch singles ratings" },
				{ status: 500 }
			);
		}

		if (doublesPlayerError) {
			console.error("Error fetching doubles player ratings:", doublesPlayerError);
			return NextResponse.json(
				{ error: "Failed to fetch doubles player ratings" },
				{ status: 500 }
			);
		}

		if (doublesTeamRatingsError) {
			console.error("Error fetching doubles team ratings:", doublesTeamRatingsError);
			return NextResponse.json(
				{ error: "Failed to fetch doubles team ratings" },
				{ status: 500 }
			);
		}

		// Fetch all teams for team ratings
		const teamIds = doublesTeamRatings?.map((r) => r.team_id) || [];
		let teamsMap = new Map<
			string,
			{ player_1_id: string; player_2_id: string }
		>();

		if (teamIds.length > 0) {
			const { data: teams, error: teamsError } = await supabase
				.from("double_teams")
				.select("id, player_1_id, player_2_id")
				.in("id", teamIds);

			if (teamsError) {
				console.error("Error fetching teams:", teamsError);
				return NextResponse.json(
					{ error: "Failed to fetch teams" },
					{ status: 500 }
				);
			}

			teams?.forEach((team) => {
				teamsMap.set(team.id, {
					player_1_id: team.player_1_id,
					player_2_id: team.player_2_id,
				});
			});
		}

		// Get all unique player IDs (only for requested views)
		const allPlayerIds = new Set<string>();
		if (shouldFetchSingles && singlesRatings) {
			singlesRatings.forEach((r) => allPlayerIds.add(r.player_id));
		}
		if (shouldFetchDoublesPlayer && doublesPlayerRatings) {
			doublesPlayerRatings.forEach((r) => allPlayerIds.add(r.player_id));
		}
		if (shouldFetchDoublesTeam) {
			teamsMap.forEach((team) => {
				allPlayerIds.add(team.player_1_id);
				allPlayerIds.add(team.player_2_id);
			});
		}

		// Fetch user details from profiles table (fast database query)
		const usersMap = new Map<string, { display_name: string; avatar: string | null }>();

		if (allPlayerIds.size > 0) {
			const { data: profiles, error: profilesError } = await supabase
				.from("profiles")
				.select("id, display_name, avatar_url")
				.in("id", Array.from(allPlayerIds));

			if (profilesError) {
				console.error("Error fetching profiles:", profilesError);
				return NextResponse.json(
					{ error: "Failed to fetch user details" },
					{ status: 500 }
				);
			}

			// Create map for all users we need
			(profiles || []).forEach((profile) => {
				usersMap.set(profile.id, {
					display_name: profile.display_name || "User",
					avatar: profile.avatar_url || null,
				});
			});
		}

		// Get latest sessions once for rank movements (if needed)
		const [latestSessionId, previousSessionId] = shouldFetchSingles || shouldFetchDoublesPlayer || shouldFetchDoublesTeam
			? await getLatestTwoCompletedSessions()
			: [null, null];

		// ========== BUILD SINGLES STATISTICS ==========
		let singlesStats: Array<{
			player_id: string;
			display_name: string;
			avatar: string | null;
			matches_played: number;
			wins: number;
			losses: number;
			draws: number;
			sets_won: number;
			sets_lost: number;
			elo: number;
			rank_movement: number;
		}> = [];

		if (shouldFetchSingles && singlesRatings) {
			singlesStats = (singlesRatings || []).map((rating) => {
				const user = usersMap.get(rating.player_id);
				return {
					player_id: rating.player_id,
					display_name: user?.display_name || "User",
					avatar: user?.avatar || null,
					matches_played: rating.matches_played ?? 0,
					wins: rating.wins ?? 0,
					losses: rating.losses ?? 0,
					draws: rating.draws ?? 0,
					sets_won: rating.sets_won ?? 0,
					sets_lost: rating.sets_lost ?? 0,
					elo: rating.elo ?? 1500,
					rank_movement: 0, // Will be updated below
				};
			});
			singlesStats.sort((a, b) => b.elo - a.elo);

			// ========== COMPUTE RANK MOVEMENTS FOR SINGLES ==========
			// Note: We use latestSessionId because snapshots are stored at session start,
			// which represents the state AFTER the previous session completes
			if (latestSessionId && previousSessionId) {
				const singlesPlayerIds = singlesStats.map((s) => s.player_id);
				const singlesRankMovements = await computeRankMovements(
					singlesPlayerIds,
					latestSessionId, // Use latest session snapshot (state after previous session)
					"player_singles",
					previousSessionId // Pass for fallback if snapshots don't exist
				);
				// Add rank_movement to each stat
				singlesStats.forEach((stat) => {
					const movement = singlesRankMovements.get(stat.player_id) ?? 0;
					stat.rank_movement = movement;
				});
			}
		}

		// ========== BUILD DOUBLES PLAYER STATISTICS ==========
		let doublesPlayerStats: Array<{
			player_id: string;
			display_name: string;
			avatar: string | null;
			matches_played: number;
			wins: number;
			losses: number;
			draws: number;
			sets_won: number;
			sets_lost: number;
			elo: number;
			rank_movement: number;
		}> = [];

		if (shouldFetchDoublesPlayer && doublesPlayerRatings) {
			doublesPlayerStats = (doublesPlayerRatings || []).map((rating) => {
				const user = usersMap.get(rating.player_id);
				return {
					player_id: rating.player_id,
					display_name: user?.display_name || "User",
					avatar: user?.avatar || null,
					matches_played: rating.matches_played ?? 0,
					wins: rating.wins ?? 0,
					losses: rating.losses ?? 0,
					draws: rating.draws ?? 0,
					sets_won: rating.sets_won ?? 0,
					sets_lost: rating.sets_lost ?? 0,
					elo: rating.elo ?? 1500,
					rank_movement: 0, // Will be updated below
				};
			});
			doublesPlayerStats.sort((a, b) => b.elo - a.elo);

			// ========== COMPUTE RANK MOVEMENTS FOR DOUBLES PLAYERS ==========
			if (latestSessionId && previousSessionId) {
				const doublesPlayerIds = doublesPlayerStats.map((s) => s.player_id);
				const doublesPlayerRankMovements = await computeRankMovements(
					doublesPlayerIds,
					latestSessionId, // Use latest session snapshot (state after previous session)
					"player_doubles",
					previousSessionId // Pass for fallback if snapshots don't exist
				);
				// Add rank_movement to each stat
				doublesPlayerStats.forEach((stat) => {
					const movement = doublesPlayerRankMovements.get(stat.player_id) ?? 0;
					stat.rank_movement = movement;
				});
			}
		}

		// ========== BUILD DOUBLES TEAM STATISTICS ==========
		let doublesTeamStats: Array<{
			team_id: string;
			player1: { id: string; display_name: string; avatar: string | null };
			player2: { id: string; display_name: string; avatar: string | null };
			matches_played: number;
			wins: number;
			losses: number;
			draws: number;
			sets_won: number;
			sets_lost: number;
			elo: number;
			rank_movement: number;
		}> = [];

		if (shouldFetchDoublesTeam && doublesTeamRatings) {
			doublesTeamStats = (doublesTeamRatings || [])
				.map((rating) => {
					const team = teamsMap.get(rating.team_id);
					if (!team) return null;

					const player1 = usersMap.get(team.player_1_id);
					const player2 = usersMap.get(team.player_2_id);

					return {
						team_id: rating.team_id,
						player1: {
							id: team.player_1_id,
							display_name: player1?.display_name || "User",
							avatar: player1?.avatar || null,
						},
						player2: {
							id: team.player_2_id,
							display_name: player2?.display_name || "User",
							avatar: player2?.avatar || null,
						},
						matches_played: rating.matches_played ?? 0,
						wins: rating.wins ?? 0,
						losses: rating.losses ?? 0,
						draws: rating.draws ?? 0,
						sets_won: rating.sets_won ?? 0,
						sets_lost: rating.sets_lost ?? 0,
						elo: rating.elo ?? 1500,
						rank_movement: 0, // Will be updated below
					};
				})
				.filter((team) => team !== null) as Array<{
				team_id: string;
				player1: { id: string; display_name: string; avatar: string | null };
				player2: { id: string; display_name: string; avatar: string | null };
				matches_played: number;
				wins: number;
				losses: number;
				draws: number;
				sets_won: number;
				sets_lost: number;
				elo: number;
				rank_movement: number;
			}>;
			doublesTeamStats.sort((a, b) => b.elo - a.elo);

			// ========== COMPUTE RANK MOVEMENTS FOR DOUBLES TEAMS ==========
			if (latestSessionId && previousSessionId) {
				const doublesTeamIds = doublesTeamStats.map((s) => s.team_id);
				const doublesTeamRankMovements = await computeRankMovements(
					doublesTeamIds,
					latestSessionId, // Use latest session snapshot (state after previous session)
					"double_team",
					previousSessionId // Pass for fallback if snapshots don't exist
				);
				// Add rank_movement to each stat
				doublesTeamStats.forEach((stat) => {
					const movement = doublesTeamRankMovements.get(stat.team_id) ?? 0;
					stat.rank_movement = movement;
				});
			}
		}

		return NextResponse.json({
			singles: singlesStats,
			doublesPlayers: doublesPlayerStats,
			doublesTeams: doublesTeamStats,
		});
	} catch (error) {
		console.error("Unexpected error in GET /api/statistics:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
