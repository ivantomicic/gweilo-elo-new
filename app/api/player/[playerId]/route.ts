import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

/**
 * GET /api/player/[playerId]
 *
 * Fetch player information by ID
 *
 * Security:
 * - Requires authentication
 * - Returns player's display name and avatar from user_metadata
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: { playerId: string } }
) {
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

		const playerId = params.playerId;

		// Fetch player data from profiles table (fast database query)
		const { data: profile, error: profileError } = await supabase
			.from("profiles")
			.select("id, display_name, avatar_url")
			.eq("id", playerId)
			.single();

		if (profileError || !profile) {
			console.error("Error fetching player:", profileError);
			return NextResponse.json(
				{ error: "Player not found" },
				{ status: 404 }
			);
		}

		return NextResponse.json({
			id: profile.id,
			display_name: profile.display_name || "Unknown",
			avatar: profile.avatar_url || null,
		});
	} catch (error) {
		console.error("Unexpected error in GET /api/player/[playerId]:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
