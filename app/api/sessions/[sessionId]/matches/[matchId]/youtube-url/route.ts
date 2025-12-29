import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdmin } from "@/lib/supabase/admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

/**
 * POST /api/sessions/[sessionId]/matches/[matchId]/youtube-url
 *
 * Update YouTube URL for a match (admin only)
 *
 * Security:
 * - Requires authentication
 * - Requires admin role
 * - Only updates youtube_url (does not touch scores, status, or Elo)
 */
export async function POST(
	request: NextRequest,
	{ params }: { params: { sessionId: string; matchId: string } }
) {
	try {
		const authHeader = request.headers.get("authorization");
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 }
			);
		}

		// Verify admin access
		const userId = await verifyAdmin(authHeader);
		if (!userId) {
			return NextResponse.json(
				{ error: "Unauthorized. Admin access required." },
				{ status: 403 }
			);
		}

		const { sessionId, matchId } = params;
		if (!sessionId || !matchId) {
			return NextResponse.json(
				{ error: "Missing sessionId or matchId" },
				{ status: 400 }
			);
		}

		const token = authHeader.replace("Bearer ", "");

		// Create Supabase client
		const supabase = createClient(supabaseUrl, supabaseAnonKey, {
			global: {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		});

		// Parse request body
		const body = await request.json();
		const { youtube_url } = body;

		// Validate YouTube URL if provided
		if (youtube_url !== null && youtube_url !== undefined && youtube_url !== "") {
			const urlString = String(youtube_url).trim();
			if (
				!urlString.includes("youtube.com") &&
				!urlString.includes("youtu.be")
			) {
				return NextResponse.json(
					{
						error:
							"Invalid YouTube URL. Must contain youtube.com or youtu.be",
					},
					{ status: 400 }
				);
			}
		}

		// Verify match exists and belongs to the session
		const { data: match, error: matchError } = await supabase
			.from("session_matches")
			.select("id, session_id")
			.eq("id", matchId)
			.eq("session_id", sessionId)
			.single();

		if (matchError || !match) {
			return NextResponse.json(
				{ error: "Match not found" },
				{ status: 404 }
			);
		}

		// Update only youtube_url (explicitly set to null if empty string)
		const urlToSave = youtube_url === "" ? null : youtube_url || null;

		const { error: updateError } = await supabase
			.from("session_matches")
			.update({ youtube_url: urlToSave })
			.eq("id", matchId);

		if (updateError) {
			console.error("Error updating YouTube URL:", updateError);
			return NextResponse.json(
				{ error: "Failed to update YouTube URL" },
				{ status: 500 }
			);
		}

		return NextResponse.json({
			success: true,
			youtube_url: urlToSave,
		});
	} catch (error) {
		console.error("Unexpected error in POST /api/sessions/[sessionId]/matches/[matchId]/youtube-url:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}

