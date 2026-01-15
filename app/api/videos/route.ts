import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

/**
 * GET /api/videos
 *
 * Fetch all matches with video URLs attached
 *
 * Security:
 * - Requires authentication
 * - Returns matches with video URLs, sorted by most recent first
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

		// Fetch matches with video URLs, joined with sessions
		const { data: matches, error: matchesError } = await supabase
			.from("session_matches")
			.select(
				`
				id,
				session_id,
				round_number,
				match_type,
				player_ids,
				team1_score,
				team2_score,
				video_url,
				sessions!inner (
					id,
					created_at,
					completed_at
				)
			`
			)
			.not("video_url", "is", null);

		if (matchesError) {
			console.error("Error fetching matches with videos:", matchesError);
			return NextResponse.json(
				{ error: "Failed to fetch videos" },
				{ status: 500 }
			);
		}

		if (!matches || matches.length === 0) {
			return NextResponse.json({ videos: [] });
		}

		// Extract all unique player IDs from all matches
		const allPlayerIds = new Set<string>();
		matches.forEach((match) => {
			if (Array.isArray(match.player_ids)) {
				match.player_ids.forEach((id: string) => allPlayerIds.add(id));
			}
		});

		// Fetch player details using admin client
		const adminClient = createAdminClient();
		const usersMap = new Map<
			string,
			{ display_name: string; avatar: string | null }
		>();

		if (allPlayerIds.size > 0) {
			const { data: allUsersData, error: usersError } =
				await adminClient.auth.admin.listUsers();

			if (usersError) {
				console.error("Error fetching users:", usersError);
				return NextResponse.json(
					{ error: "Failed to fetch user details" },
					{ status: 500 }
				);
			}

			// Create map for all users we need
			allUsersData.users
				.filter((u) => allPlayerIds.has(u.id))
				.forEach((user) => {
					usersMap.set(user.id, {
						display_name:
							user.user_metadata?.name ||
							user.user_metadata?.display_name ||
							user.email?.split("@")[0] ||
							"User",
						avatar: user.user_metadata?.avatar_url || null,
					});
				});
		}

		// Build video items with player details
		const videos = matches.map((match) => {
			const session = match.sessions as {
				id: string;
				created_at: string;
				completed_at: string | null;
			};

			// Determine session date (use completed_at if available, otherwise created_at)
			const sessionDate =
				session.completed_at || session.created_at;

			// Extract player IDs based on match type
			const isSingles = match.match_type === "singles";
			const team1PlayerIds = isSingles
				? [match.player_ids[0]]
				: [match.player_ids[0], match.player_ids[1]];
			const team2PlayerIds = isSingles
				? [match.player_ids[1]]
				: [match.player_ids[2], match.player_ids[3]];

			// Get player names
			const team1Players = team1PlayerIds
				.map((id: string) => usersMap.get(id))
				.filter(Boolean) as Array<{
				display_name: string;
				avatar: string | null;
			}>;
			const team2Players = team2PlayerIds
				.map((id: string) => usersMap.get(id))
				.filter(Boolean) as Array<{
				display_name: string;
				avatar: string | null;
			}>;

			const team1Name = isSingles
				? team1Players[0]?.display_name || "Unknown"
				: `${team1Players[0]?.display_name || ""} & ${
						team1Players[1]?.display_name || ""
				  }`.trim();
			const team2Name = isSingles
				? team2Players[0]?.display_name || "Unknown"
				: `${team2Players[0]?.display_name || ""} & ${
						team2Players[1]?.display_name || ""
				  }`.trim();

			// Get avatars for each team
			const team1Avatar = isSingles
				? team1Players[0]?.avatar || null
				: null; // For doubles, we'll use individual player avatars
			const team2Avatar = isSingles
				? team2Players[0]?.avatar || null
				: null;

			// For doubles, get individual player avatars
			const team1Player1Avatar = isSingles
				? null
				: team1Players[0]?.avatar || null;
			const team1Player2Avatar = isSingles
				? null
				: team1Players[1]?.avatar || null;
			const team2Player1Avatar = isSingles
				? null
				: team2Players[0]?.avatar || null;
			const team2Player2Avatar = isSingles
				? null
				: team2Players[1]?.avatar || null;

			return {
				matchId: match.id,
				sessionId: match.session_id,
				roundNumber: match.round_number,
				matchType: match.match_type,
				team1Name,
				team2Name,
				team1Avatar,
				team2Avatar,
				team1Player1Avatar,
				team1Player2Avatar,
				team2Player1Avatar,
				team2Player2Avatar,
				team1Score: match.team1_score ?? null,
				team2Score: match.team2_score ?? null,
				videoUrl: match.video_url,
				sessionDate,
			};
		});

		// Sort by session date (most recent first)
		videos.sort((a, b) => {
			const dateA = new Date(a.sessionDate).getTime();
			const dateB = new Date(b.sessionDate).getTime();
			return dateB - dateA;
		});

		return NextResponse.json({ videos });
	} catch (error) {
		console.error("Unexpected error in GET /api/videos:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}

