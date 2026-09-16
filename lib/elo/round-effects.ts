import { revalidateTag } from "next/cache";
import { refreshSessionBestWorstPlayer } from "@/lib/elo/best-worst-player";
import { endSessionLiveActivitySafely, updateSessionLiveActivitySafely } from "@/lib/live-activities/service";
import { notifySessionCompleted } from "@/lib/notifications/events";
import { refreshMissionSnapshotsAfterDataChange } from "@/lib/rivalries/service";
import { createAdminClient } from "@/lib/supabase/admin";

type EffectsClaim = {
	submission_id: string;
	effects_token: string;
	payload: {
		sessionId: string;
		createdBy: string;
		isLastRound: boolean;
		excludeUserIds: string[];
	};
	attempt_count: number;
};

/** Drain a bounded batch so a scheduled invocation never runs indefinitely. */
export async function processPendingRoundEffects(limit = 10, targetSubmissionId?: string) {
	const adminClient = createAdminClient();
	let processed = 0;
	let failed = 0;
	for (let index = 0; index < limit; index += 1) {
		const { data, error } = await adminClient.rpc("claim_next_round_effects", {
			p_submission_id: targetSubmissionId ?? null,
		});
		if (error) throw new Error(`Could not claim round effects: ${error.message}`);
		const claim = (data as EffectsClaim[] | null)?.[0];
		if (!claim) break;
		try {
			const { sessionId, createdBy, isLastRound, excludeUserIds } = claim.payload;
			if (isLastRound) {
				await refreshSessionBestWorstPlayer(sessionId, adminClient);
				revalidateTag("statistics");
				await refreshMissionSnapshotsAfterDataChange({
					adminClient,
					reason: "session_completed",
				});
				await Promise.all([
					notifySessionCompleted({ sessionId, createdBy, excludeUserIds }),
					endSessionLiveActivitySafely(sessionId),
				]);
			} else {
				await updateSessionLiveActivitySafely(sessionId);
			}
			const { data: updated, error: doneError } = await adminClient
				.from("elo_round_submissions")
				.update({ effects_status: "done", effects_error: null })
				.eq("id", claim.submission_id)
				.eq("effects_claim_token", claim.effects_token)
				.eq("effects_status", "processing")
				.select("id")
				.maybeSingle();
			if (doneError || !updated) throw new Error(doneError?.message || "Effects claim expired");
			processed += 1;
		} catch (effectError) {
			failed += 1;
			console.error("Round effects failed:", claim.submission_id, effectError);
			const backoffSeconds = Math.min(60 * 60, 30 * 2 ** Math.min(claim.attempt_count, 7));
			const { error: retryError } = await adminClient
				.from("elo_round_submissions")
				.update({
					effects_status: "pending",
					effects_error: String(effectError).slice(0, 2000),
					effects_next_attempt_at: new Date(Date.now() + backoffSeconds * 1000).toISOString(),
				})
				.eq("id", claim.submission_id)
				.eq("effects_claim_token", claim.effects_token)
				.eq("effects_status", "processing");
			if (retryError) console.error("Could not schedule round effects retry:", retryError);
		}
	}
	return { processed, failed };
}
