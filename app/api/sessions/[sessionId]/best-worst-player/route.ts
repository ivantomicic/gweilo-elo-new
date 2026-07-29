import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateBestWorstPlayer } from "@/lib/elo/best-worst-player";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

/**
 * Returns best/worst singles players using the exact Elo deltas committed to
 * match_elo_history. The response contract is shared with the cached fields on
 * sessions.
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: { sessionId: string } },
) {
	const adminClient = createAdminClient();

	try {
		const authHeader = request.headers.get("authorization");
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 },
			);
		}

		const token = authHeader.replace("Bearer ", "");
		const sessionId = params.sessionId;
		if (!sessionId) {
			return NextResponse.json(
				{ error: "Session ID is required" },
				{ status: 400 },
			);
		}

		const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
			global: { headers: { Authorization: `Bearer ${token}` } },
		});
		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser(token);

		if (userError || !user) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 },
			);
		}

		const { data: session, error: sessionError } = await adminClient
			.from("sessions")
			.select("id, status")
			.eq("id", sessionId)
			.single();

		if (sessionError || !session) {
			return NextResponse.json(
				{ error: "Session not found" },
				{ status: 404 },
			);
		}

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

		return NextResponse.json(
			await calculateBestWorstPlayer(sessionId, adminClient),
		);
	} catch (error) {
		console.error("Unexpected error in best-worst-player:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
