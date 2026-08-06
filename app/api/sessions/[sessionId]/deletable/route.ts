import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, verifyAdmin } from "@/lib/supabase/admin";
import {
	getSessionDeletionFailure,
	type AtomicSessionDeletionResult,
} from "@/lib/sessions/deletion";

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
 * The same transactional database function used by DELETE performs a dry run,
 * so the button and the final mutation share identical safety checks.
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

		const { data, error } = await adminClient.rpc(
			"delete_latest_completed_session_atomic",
			{
				p_session_id: sessionId,
				p_deleted_by: adminUserId,
				p_execute: false,
			},
		);

		if (error || !data) {
			console.error("Session deletion safety check failed:", error);
			return NextResponse.json(
				{ error: "Cannot verify whether this session can be deleted safely" },
				{ status: 500 },
			);
		}

		const result = data as AtomicSessionDeletionResult;
		const failure = getSessionDeletionFailure(result);
		const deletable = result.state === "deletable";
		const isLatestCompleted = [
			"deletable",
			"deleted",
			"active_session_has_results",
			"recalculation_running",
			"rating_state_conflict",
			"snapshot_incomplete",
		].includes(result.state);

		return NextResponse.json({
			deletable,
			reason: failure?.error ?? null,
			state: result.state,
			is_latest_completed: isLatestCompleted,
			latest_completed_session_id: result.latestSessionId ?? null,
			previous_session_id: result.previousSessionId ?? null,
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
