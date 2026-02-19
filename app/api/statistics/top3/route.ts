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

		// Build guest id set so leaderboard never shows guest accounts
		const adminClient = createAdminClient();
		const guestUserIds = new Set<string>();
		const perPage = 1000;
		let page = 1;

		while (true) {
			const {
				data: { users },
				error: usersError,
			} = await adminClient.auth.admin.listUsers({
				page,
				perPage,
			});

			if (usersError) {
				console.error("Error fetching users for top3 filtering:", usersError);
				return NextResponse.json(
					{ error: "Failed to fetch user roles" },
					{ status: 500 },
				);
			}

			users.forEach((listedUser) => {
				if (listedUser.user_metadata?.role === "guest") {
					guestUserIds.add(listedUser.id);
				}
			});

			if (users.length < perPage) {
				break;
			}

			page += 1;
		}

		// Fetch ranked players by Elo (singles only)
		const { data: singlesRatings, error: singlesError } = await supabase
			.from("player_ratings")
			.select("player_id, elo")
			.order("elo", { ascending: false });

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

		const top3NonGuestRatings = singlesRatings
			.filter((rating) => !guestUserIds.has(rating.player_id))
			.slice(0, 3);

		if (top3NonGuestRatings.length === 0) {
			return NextResponse.json({ data: [] });
		}

		// Get player IDs
		const playerIds = top3NonGuestRatings.map((r) => r.player_id);

		// Fetch user profiles from database (fast!) instead of Auth Admin API (slow!)
		const { data: profiles, error: profilesError } = await supabase
			.from("profiles")
			.select("id, display_name, avatar_url")
			.in("id", playerIds);

		if (profilesError) {
			console.error("Error fetching profiles:", profilesError);
		}

		// Create lookup map
		const profilesMap = new Map(
			(profiles || []).map((p) => [p.id, p])
		);

		// Build response with top 3 players
		const top3Stats = top3NonGuestRatings.map((rating) => {
			const profile = profilesMap.get(rating.player_id);
			return {
				player_id: rating.player_id,
				display_name: profile?.display_name || "User",
				avatar: profile?.avatar_url || null,
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
