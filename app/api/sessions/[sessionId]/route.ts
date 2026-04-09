import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient, verifyAdmin } from "@/lib/supabase/admin";
import { rebuildAllEloData } from "@/lib/elo/rebuild";

/**
 * DELETE /api/sessions/[sessionId]
 *
 * Delete a completed session and rebuild all Elo ratings from scratch
 *
 * Guards:
 * - User must be admin
 * - Session must be completed
 * - Session must be the latest completed session
 *
 * Algorithm:
 * 1. Delete session data (session, matches, snapshots, history)
 * 2. Clear all Elo state, history, and snapshots
 * 3. Replay all remaining sessions in chronological order
 * 4. Persist rebuilt ratings, match history, and snapshots
 *
 * CRITICAL: We rebuild from scratch, NOT by reversing deltas (Elo is order-dependent)
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

		// ============================================================================
		// GUARDS: Verify session exists, is completed, and is the latest completed
		// ============================================================================
		const { data: session, error: sessionError } = await adminClient
			.from("sessions")
			.select("id, status, completed_at, created_at")
			.eq("id", sessionId)
			.single();

		if (sessionError || !session) {
			return NextResponse.json(
				{ error: "Session not found" },
				{ status: 404 }
			);
		}

		if (session.status !== "completed") {
			return NextResponse.json(
				{ error: "Only completed sessions can be deleted" },
				{ status: 400 }
			);
		}

		// Verify this is the latest completed session
		const { data: latestCompletedSession, error: latestError } =
			await adminClient
				.from("sessions")
				.select("id, completed_at")
				.eq("status", "completed")
				.order("completed_at", { ascending: false })
				.limit(1)
				.single();

		if (latestError || !latestCompletedSession) {
			return NextResponse.json(
				{
					error: "Cannot verify if this is the latest completed session",
				},
				{ status: 500 }
			);
		}

		if (latestCompletedSession.id !== sessionId) {
			return NextResponse.json(
				{
					error: "Only the latest completed session can be deleted",
					latest_completed_session_id: latestCompletedSession.id,
				},
				{ status: 400 }
			);
		}

		// ============================================================================
		// STEP 1: Delete session data
		// ============================================================================
		// Get all matches in this session first (for history/snapshot deletion)
		const { data: sessionMatches, error: matchesError } = await adminClient
			.from("session_matches")
			.select("id")
			.eq("session_id", sessionId);

		if (matchesError) {
			console.error("Error fetching session matches:", matchesError);
			return NextResponse.json(
				{ error: "Failed to fetch session matches" },
				{ status: 500 }
			);
		}

		const matchIds = (sessionMatches || []).map((m) => m.id);

		// Delete match Elo history
		if (matchIds.length > 0) {
			const { error: historyError } = await adminClient
				.from("match_elo_history")
				.delete()
				.in("match_id", matchIds);

			if (historyError) {
				console.error("Error deleting match history:", historyError);
				return NextResponse.json(
					{ error: "Failed to delete match history" },
					{ status: 500 }
				);
			}
		}

		// Delete Elo snapshots
		if (matchIds.length > 0) {
			const { error: snapshotsError } = await adminClient
				.from("elo_snapshots")
				.delete()
				.in("match_id", matchIds);

			if (snapshotsError) {
				console.error("Error deleting snapshots:", snapshotsError);
				// Non-fatal, continue
			}
		}

		// Delete session rating snapshots
		const { error: sessionSnapshotsError } = await adminClient
			.from("session_rating_snapshots")
			.delete()
			.eq("session_id", sessionId);

		if (sessionSnapshotsError) {
			console.error("Error deleting session snapshots:", sessionSnapshotsError);
			// Non-fatal, continue
		}

		// Delete session matches
		const { error: deleteMatchesError } = await adminClient
			.from("session_matches")
			.delete()
			.eq("session_id", sessionId);

		if (deleteMatchesError) {
			console.error("Error deleting session matches:", deleteMatchesError);
			return NextResponse.json(
				{ error: "Failed to delete session matches" },
				{ status: 500 }
			);
		}

		// Delete session players
		const { error: deletePlayersError } = await adminClient
			.from("session_players")
			.delete()
			.eq("session_id", sessionId);

		if (deletePlayersError) {
			console.error("Error deleting session players:", deletePlayersError);
			return NextResponse.json(
				{ error: "Failed to delete session players" },
				{ status: 500 }
			);
		}

		// Delete the session itself
		const { error: deleteSessionError } = await adminClient
			.from("sessions")
			.delete()
			.eq("id", sessionId);

		if (deleteSessionError) {
			console.error("Error deleting session:", deleteSessionError);
			return NextResponse.json(
				{ error: "Failed to delete session" },
				{ status: 500 }
			);
		}

		const rebuildResult = await rebuildAllEloData({
			adminClient,
			triggeredBy: adminUserId,
			reason: "delete_session_rebuild",
		});

		console.log(
			JSON.stringify({
				tag: "[DELETE_SESSION]",
				action: "DELETE_SESSION",
				session_id: sessionId,
				deleted_by: adminUserId,
				timestamp: new Date().toISOString(),
				remaining_sessions_replayed: rebuildResult.sessionsReplayed,
				matches_replayed: rebuildResult.matchesReplayed,
				skipped_matches: rebuildResult.skippedMatches,
			})
		);

		revalidateTag("statistics");

		return NextResponse.json({
			success: true,
			message: "Session deleted and Elo ratings rebuilt successfully",
			deleted_session_id: sessionId,
			remaining_sessions_count: rebuildResult.sessionsReplayed,
			rebuild: rebuildResult,
		});
	} catch (error) {
		console.error("Unexpected error in DELETE /api/sessions/[sessionId]:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
