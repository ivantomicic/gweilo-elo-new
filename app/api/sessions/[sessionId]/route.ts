import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient, verifyAdmin } from "@/lib/supabase/admin";
import {
	getSessionDeletionFailure,
	type AtomicSessionDeletionResult,
} from "@/lib/sessions/deletion";

/**
 * DELETE /api/sessions/[sessionId]
 *
 * Atomically delete the latest completed session and restore the exact rating
 * snapshot captured after the preceding completed session.
 *
 * Guards:
 * - User must be admin
 * - Session must be completed
 * - Session must be the latest completed session
 *
 * The database function owns validation, locking, restoration, deletion, and
 * audit logging in one transaction. A failure leaves all data unchanged.
 */
export async function DELETE(
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
				p_execute: true,
			},
		);

		if (error || !data) {
			console.error("Atomic session deletion failed:", error);
			return NextResponse.json(
				{ error: "Failed to delete session safely" },
				{ status: 500 },
			);
		}

		const result = data as AtomicSessionDeletionResult;
		const failure = getSessionDeletionFailure(result);
		if (failure) {
			return NextResponse.json(
				{
					error: failure.error,
					state: result.state,
					latest_completed_session_id: result.latestSessionId ?? null,
					previous_session_id: result.previousSessionId ?? null,
				},
				{ status: failure.status },
			);
		}

		if (result.state !== "deleted") {
			return NextResponse.json(
				{ error: "Unexpected session deletion state" },
				{ status: 500 },
			);
		}

		console.log(
			JSON.stringify({
				tag: "[DELETE_SESSION]",
				action: "DELETE_SESSION",
				session_id: sessionId,
				deleted_by: adminUserId,
				timestamp: new Date().toISOString(),
				previous_session_id: result.previousSessionId ?? null,
				deleted_match_count: result.deletedMatchCount ?? 0,
				restored_singles_count: result.restoredSinglesCount ?? 0,
				restored_doubles_player_count:
					result.restoredDoublesPlayerCount ?? 0,
				restored_doubles_team_count: result.restoredDoublesTeamCount ?? 0,
			})
		);

		revalidateTag("statistics");

		return NextResponse.json({
			success: true,
			message: "Session deleted and Elo ratings restored successfully",
			deleted_session_id: sessionId,
			previous_session_id: result.previousSessionId ?? null,
			restored: {
				singles: result.restoredSinglesCount ?? 0,
				doubles_players: result.restoredDoublesPlayerCount ?? 0,
				doubles_teams: result.restoredDoublesTeamCount ?? 0,
			},
		});
	} catch (error) {
		console.error("Unexpected error in DELETE /api/sessions/[sessionId]:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
