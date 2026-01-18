import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

/**
 * GET /api/statistics/top3
 *
 * Lightweight endpoint to fetch top 3 players by Elo (singles only)
 * Optimized for dashboard widget - no rank movements, no doubles, minimal data fetching
 *
 * Security:
 * - Requires authentication
 * - Returns only top 3 players with basic info
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

		// Fetch top 3 players by Elo (singles only)
		const { data: singlesRatings, error: singlesError } = await supabase
			.from("player_ratings")
			.select("player_id, elo")
			.order("elo", { ascending: false })
			.limit(3);

		if (singlesError) {
			console.error("Error fetching top 3 players:", singlesError);
			return NextResponse.json(
				{ error: "Failed to fetch top players" },
				{ status: 500 }
			);
		}

		if (!singlesRatings || singlesRatings.length === 0) {
			return NextResponse.json({ data: [] });
		}

		// Get player IDs
		const playerIds = singlesRatings.map((r) => r.player_id);

		// Fetch only the top 3 users (not all users!)
		const adminClient = createAdminClient();
		const { data: allUsersData, error: usersError } =
			await adminClient.auth.admin.listUsers();

		if (usersError) {
			console.error("Error fetching users:", usersError);
			return NextResponse.json(
				{ error: "Failed to fetch user details" },
				{ status: 500 }
			);
		}

		// Create map for only the top 3 users
		const usersMap = new Map<string, { display_name: string; avatar: string | null }>();
		
		if (allUsersData?.users) {
			playerIds.forEach((playerId) => {
				const user = allUsersData.users.find((u) => u.id === playerId);
				if (user) {
					usersMap.set(user.id, {
						display_name:
							user.user_metadata?.display_name ||
							user.user_metadata?.name ||
							user.email?.split("@")[0] ||
							"User",
						avatar: user.user_metadata?.avatar_url || null,
					});
				}
			});
		}

		// Build response with top 3 players
		const top3Stats = singlesRatings.map((rating) => {
			const user = usersMap.get(rating.player_id);
			return {
				player_id: rating.player_id,
				display_name: user?.display_name || "User",
				avatar: user?.avatar || null,
				elo: rating.elo ?? 1500,
			};
		});

		return NextResponse.json({ data: top3Stats });
	} catch (error) {
		console.error("Unexpected error in GET /api/statistics/top3:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
