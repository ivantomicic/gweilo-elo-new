import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, verifyUser } from "@/lib/supabase/admin";

type CancellationResult = {
	state:
		| "cancelled"
		| "not_found"
		| "forbidden"
		| "not_active"
		| "has_results";
	sessionId?: string;
	completedMatchCount?: number;
};

/**
 * POST /api/sessions/[sessionId]/cancel
 *
 * Removes an accidental active session only while it has no submitted results.
 * Once play has started, callers must force-close instead.
 */
export async function POST(
	request: NextRequest,
	{ params }: { params: { sessionId: string } },
) {
	const auth = await verifyUser(request.headers.get("authorization"));
	if (!auth) {
		return NextResponse.json(
			{ error: "Unauthorized. Authentication required." },
			{ status: 401 },
		);
	}
	if (auth.role !== "admin" && auth.role !== "mod") {
		return NextResponse.json(
			{ error: "Only admins and mods can cancel sessions." },
			{ status: 403 },
		);
	}

	const admin = createAdminClient();
	const { data, error } = await admin.rpc(
		"cancel_active_session_atomic",
		{
			p_session_id: params.sessionId,
			p_requested_by: auth.userId,
			p_is_admin: auth.role === "admin",
		},
	);
	if (error) {
		console.error("Atomic session cancellation failed:", error);
		return NextResponse.json(
			{ error: "Failed to cancel session." },
			{ status: 500 },
		);
	}

	const result = data as CancellationResult;
	switch (result.state) {
		case "cancelled":
			return NextResponse.json({
				success: true,
				cancelledSessionId: result.sessionId,
			});
		case "not_found":
			return NextResponse.json(
				{ error: "Session not found." },
				{ status: 404 },
			);
		case "forbidden":
			return NextResponse.json(
				{ error: "You cannot cancel this session." },
				{ status: 403 },
			);
		case "has_results":
			return NextResponse.json(
				{
					error:
						"Results have already been submitted. Force-close this session instead.",
					completedMatchCount: result.completedMatchCount,
				},
				{ status: 409 },
			);
		default:
			return NextResponse.json(
				{ error: "Only active sessions can be cancelled." },
				{ status: 409 },
			);
	}
}
