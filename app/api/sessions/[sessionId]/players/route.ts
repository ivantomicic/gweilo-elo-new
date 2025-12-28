import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

/**
 * GET /api/sessions/[sessionId]/players
 *
 * Fetch session players with user details and Elo ratings
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

		const supabase = createClient(supabaseUrl, supabaseAnonKey, {
			global: {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		});

		// Fetch session players
		const { data: sessionPlayers, error: playersError } = await supabase
			.from("session_players")
			.select("*")
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

		// Fetch user details using admin client
		const adminClient = createAdminClient();
		const playerIds = sessionPlayers.map((sp) => sp.player_id);

		const { data: { users }, error: usersError } = await adminClient.auth.admin.listUsers();

		if (usersError) {
			console.error("Error fetching users:", usersError);
			return NextResponse.json(
				{ error: "Failed to fetch user details" },
				{ status: 500 }
			);
		}

		// Combine session player data with user details
		const playersWithDetails = sessionPlayers.map((sp) => {
			const user = users.find((u) => u.id === sp.player_id);
			
			return {
				id: sp.player_id,
				sessionPlayerId: sp.id,
				team: sp.team,
				name:
					user?.user_metadata?.name ||
					user?.user_metadata?.full_name ||
					user?.email?.split("@")[0] ||
					"User",
				avatar: user?.user_metadata?.avatar_url || null,
				elo: user?.user_metadata?.elo || 1200, // Default Elo if not set
			};
		});

		return NextResponse.json({ players: playersWithDetails });
	} catch (error) {
		console.error("Unexpected error in GET /api/sessions/[sessionId]/players:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}

