import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient, verifyAdmin } from "@/lib/supabase/admin";
import { updateSinglesRatings, updateDoublesRatings } from "@/lib/elo/updates";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

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
 * 2. Clear all Elo state (player_ratings, player_double_ratings, double_team_ratings)
 * 3. Replay all remaining sessions in chronological order
 * 4. Persist rebuilt ratings
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

		// ============================================================================
		// STEP 2: Clear all Elo state
		// ============================================================================
		// Clear player_ratings - fetch all IDs first, then delete
		const { data: allPlayerRatings, error: fetchSinglesError } =
			await adminClient
				.from("player_ratings")
				.select("player_id")
				.limit(10000); // Reasonable limit for safety

		if (!fetchSinglesError && allPlayerRatings && allPlayerRatings.length > 0) {
			const playerIds = allPlayerRatings.map((r) => r.player_id);
			const { error: clearSinglesError } = await adminClient
				.from("player_ratings")
				.delete()
				.in("player_id", playerIds);

			if (clearSinglesError) {
				console.error("Error clearing player_ratings:", clearSinglesError);
				return NextResponse.json(
					{ error: "Failed to clear player ratings" },
					{ status: 500 }
				);
			}
		}

		// Clear player_double_ratings - fetch all IDs first, then delete
		const { data: allPlayerDoublesRatings, error: fetchPlayerDoublesError } =
			await adminClient
				.from("player_double_ratings")
				.select("player_id")
				.limit(10000);

		if (
			!fetchPlayerDoublesError &&
			allPlayerDoublesRatings &&
			allPlayerDoublesRatings.length > 0
		) {
			const playerIds = allPlayerDoublesRatings.map((r) => r.player_id);
			const { error: clearPlayerDoublesError } = await adminClient
				.from("player_double_ratings")
				.delete()
				.in("player_id", playerIds);

			if (clearPlayerDoublesError) {
				console.error(
					"Error clearing player_double_ratings:",
					clearPlayerDoublesError
				);
				return NextResponse.json(
					{ error: "Failed to clear player doubles ratings" },
					{ status: 500 }
				);
			}
		}

		// Clear double_team_ratings - fetch all IDs first, then delete
		const { data: allTeamRatings, error: fetchTeamDoublesError } =
			await adminClient
				.from("double_team_ratings")
				.select("team_id")
				.limit(10000);

		if (!fetchTeamDoublesError && allTeamRatings && allTeamRatings.length > 0) {
			const teamIds = allTeamRatings.map((r) => r.team_id);
			const { error: clearTeamDoublesError } = await adminClient
				.from("double_team_ratings")
				.delete()
				.in("team_id", teamIds);

			if (clearTeamDoublesError) {
				console.error(
					"Error clearing double_team_ratings:",
					clearTeamDoublesError
				);
				return NextResponse.json(
					{ error: "Failed to clear team doubles ratings" },
					{ status: 500 }
				);
			}
		}

		// ============================================================================
		// STEP 3: Rebuild Elo by replaying all remaining sessions in chronological order
		// ============================================================================
		// Fetch all remaining completed sessions in chronological order
		const { data: allSessions, error: sessionsError } = await adminClient
			.from("sessions")
			.select("id, created_at")
			.eq("status", "completed")
			.order("created_at", { ascending: true });

		if (sessionsError) {
			console.error("Error fetching remaining sessions:", sessionsError);
			return NextResponse.json(
				{ error: "Failed to fetch remaining sessions" },
				{ status: 500 }
			);
		}

		console.log(
			JSON.stringify({
				tag: "[DELETE_SESSION]",
				action: "REBUILD_START",
				deleted_session_id: sessionId,
				remaining_sessions_count: allSessions?.length || 0,
				remaining_session_ids: allSessions?.map((s) => s.id) || [],
			})
		);

		// Replay each session in chronological order
		for (const sessionToReplay of allSessions || []) {
			// Fetch all matches for this session, ordered by round and match_order
			const { data: sessionMatchesToReplay, error: replayMatchesError } =
				await adminClient
					.from("session_matches")
					.select("*")
					.eq("session_id", sessionToReplay.id)
					.eq("status", "completed")
					.order("round_number", { ascending: true })
					.order("match_order", { ascending: true });

			if (replayMatchesError) {
				console.error(
					`Error fetching matches for session ${sessionToReplay.id}:`,
					replayMatchesError
				);
				continue; // Skip this session but continue with others
			}

			if (!sessionMatchesToReplay || sessionMatchesToReplay.length === 0) {
				continue; // No matches to replay
			}

			// Replay each match
			for (const match of sessionMatchesToReplay) {
				if (
					match.team1_score === null ||
					match.team2_score === null ||
					!match.player_ids ||
					match.player_ids.length < 2
				) {
					console.warn(
						`Skipping match ${match.id} - missing scores or players`
					);
					continue;
				}

				const isSingles = match.match_type === "singles";
				const playerIds = match.player_ids as string[];

				if (isSingles) {
					// Replay singles match
					await updateSinglesRatings(
						playerIds[0],
						playerIds[1],
						match.team1_score,
						match.team2_score
					);
				} else {
					// Replay doubles match
					if (playerIds.length < 4) {
						console.warn(
							`Skipping doubles match ${match.id} - not enough players`
						);
						continue;
					}

					// Replay doubles match
					// updateDoublesRatings handles team ID creation internally
					await updateDoublesRatings(
						[playerIds[0], playerIds[1]],
						[playerIds[2], playerIds[3]],
						match.team1_score,
						match.team2_score
					);
				}
			}
		}

		// ============================================================================
		// STEP 4: Log deletion
		// ============================================================================
		console.log(
			JSON.stringify({
				tag: "[DELETE_SESSION]",
				action: "DELETE_SESSION",
				session_id: sessionId,
				deleted_by: adminUserId,
				timestamp: new Date().toISOString(),
				remaining_sessions_replayed: allSessions?.length || 0,
			})
		);

		// ============================================================================
		// STEP 4: Validation - Verify final state matches expected state
		// ============================================================================
		// Count total matches across all remaining sessions
		let totalMatchesAfterRebuild = 0;
		for (const remainingSession of allSessions || []) {
			const { count } = await adminClient
				.from("session_matches")
				.select("*", { count: "exact", head: true })
				.eq("session_id", remainingSession.id)
				.eq("status", "completed");
			totalMatchesAfterRebuild += count || 0;
		}

		// Count total player ratings
		const { count: totalPlayerRatings } = await adminClient
			.from("player_ratings")
			.select("*", { count: "exact", head: true });

		// Count total doubles ratings
		const { count: totalPlayerDoublesRatings } = await adminClient
			.from("player_double_ratings")
			.select("*", { count: "exact", head: true });

		const { count: totalTeamDoublesRatings } = await adminClient
			.from("double_team_ratings")
			.select("*", { count: "exact", head: true });

		// Validation assertion: If there are no remaining sessions, all ratings should be cleared
		// If there are remaining sessions, ratings should exist (rebuild should have populated them)
		const hasRemainingSessions = (allSessions?.length || 0) > 0;
		const hasRatings =
			(totalPlayerRatings || 0) > 0 ||
			(totalPlayerDoublesRatings || 0) > 0 ||
			(totalTeamDoublesRatings || 0) > 0;

		if (hasRemainingSessions && !hasRatings) {
			console.error(
				JSON.stringify({
					tag: "[ERROR]",
					message:
						"Validation failed: Remaining sessions exist but no ratings found after rebuild",
					remaining_sessions_count: allSessions?.length || 0,
					total_player_ratings: totalPlayerRatings || 0,
					total_player_doubles_ratings: totalPlayerDoublesRatings || 0,
					total_team_doubles_ratings: totalTeamDoublesRatings || 0,
				})
			);
			// Don't fail the deletion, but log the error for investigation
		}

		console.log(
			JSON.stringify({
				tag: "[DELETE_SESSION]",
				action: "REBUILD_COMPLETE",
				deleted_session_id: sessionId,
				remaining_sessions_count: allSessions?.length || 0,
				total_matches_remaining: totalMatchesAfterRebuild,
				total_player_ratings: totalPlayerRatings || 0,
				total_player_doubles_ratings: totalPlayerDoublesRatings || 0,
				total_team_doubles_ratings: totalTeamDoublesRatings || 0,
				validation_passed: hasRemainingSessions ? hasRatings : !hasRatings,
				message:
					"Elo rebuild complete. Ratings should match state as if deleted session never existed.",
			})
		);

		return NextResponse.json({
			success: true,
			message: "Session deleted and Elo ratings rebuilt successfully",
			deleted_session_id: sessionId,
			remaining_sessions_count: allSessions?.length || 0,
		});
	} catch (error) {
		console.error("Unexpected error in DELETE /api/sessions/[sessionId]:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
