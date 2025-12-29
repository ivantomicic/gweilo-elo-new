import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

/**
 * POST /api/sessions/[sessionId]/force-close
 *
 * Force close a session (mark as completed)
 *
 * This is a fallback/emergency action to manually mark a session as completed.
 * Only the session owner can call this endpoint.
 *
 * Behavior:
 * - If session is already completed → return 200 (idempotent)
 * - Otherwise → set status = 'completed' and completed_at = now()
 * - Does NOT touch rounds, matches, or Elo ratings
 */
export async function POST(
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

		// Fetch session and verify ownership
		const { data: session, error: sessionError } = await supabase
			.from("sessions")
			.select("id, created_by, status")
			.eq("id", sessionId)
			.single();

		if (sessionError || !session) {
			return NextResponse.json(
				{ error: "Session not found" },
				{ status: 404 }
			);
		}

		// Verify user owns the session
		if (session.created_by !== user.id) {
			return NextResponse.json(
				{
					error: "Unauthorized. You can only force close your own sessions.",
				},
				{ status: 403 }
			);
		}

		// If already completed, return success (idempotent)
		if (session.status === "completed") {
			return NextResponse.json({
				success: true,
				message: "Session is already completed",
			});
		}

		// Mark session as completed
		const { error: updateError } = await adminClient
			.from("sessions")
			.update({
				status: "completed",
				completed_at: new Date().toISOString(),
			})
			.eq("id", sessionId);

		if (updateError) {
			console.error("Error force closing session:", updateError);
			return NextResponse.json(
				{ error: "Failed to force close session" },
				{ status: 500 }
			);
		}

		return NextResponse.json({
			success: true,
			message: "Session force closed successfully",
		});
	} catch (error) {
		console.error(
			"Unexpected error in POST /api/sessions/[sessionId]/force-close:",
			error
		);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}

