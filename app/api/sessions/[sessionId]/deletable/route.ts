import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient, verifyAdmin } from "@/lib/supabase/admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

/**
 * GET /api/sessions/[sessionId]/deletable
 *
 * Check if a session can be deleted
 *
 * Returns:
 * - deletable: boolean
 * - reason: string (if not deletable)
 * - is_latest_completed: boolean
 *
 * Guards:
 * - User must be admin
 * - Session must be completed
 * - Session must be the latest completed session
 */
export async function GET(
	request: NextRequest,
	{ params }: { params: { sessionId: string } }
) {
	const adminClient = createAdminClient();

	try {
		const authHeader = request.headers.get("authorization");
		const adminUserId = await verifyAdmin(authHeader);

		if (!adminUserId) {
			return NextResponse.json(
				{ error: "Unauthorized. Admin access required." },
				{ status: 403 }
			);
		}

		const sessionId = params.sessionId;

		if (!sessionId) {
			return NextResponse.json(
				{ error: "Session ID is required" },
				{ status: 400 }
			);
		}

		// Fetch session
		const { data: session, error: sessionError } = await adminClient
			.from("sessions")
			.select("id, status, completed_at")
			.eq("id", sessionId)
			.single();

		if (sessionError || !session) {
			return NextResponse.json({
				deletable: false,
				reason: "Session not found",
				is_latest_completed: false,
			});
		}

		if (session.status !== "completed") {
			return NextResponse.json({
				deletable: false,
				reason: "Only completed sessions can be deleted",
				is_latest_completed: false,
			});
		}

		// Check if this is the latest completed session
		const { data: latestCompletedSession, error: latestError } =
			await adminClient
				.from("sessions")
				.select("id, completed_at")
				.eq("status", "completed")
				.order("completed_at", { ascending: false })
				.limit(1)
				.single();

		if (latestError || !latestCompletedSession) {
			return NextResponse.json({
				deletable: false,
				reason: "Cannot verify if this is the latest completed session",
				is_latest_completed: false,
			});
		}

		const isLatestCompleted = latestCompletedSession.id === sessionId;

		return NextResponse.json({
			deletable: isLatestCompleted,
			reason: isLatestCompleted
				? null
				: "Only the latest completed session can be deleted",
			is_latest_completed: isLatestCompleted,
		});
	} catch (error) {
		console.error(
			"Unexpected error in GET /api/sessions/[sessionId]/deletable:",
			error
		);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}


