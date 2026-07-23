import { createAdminClient } from "@/lib/supabase/admin";

type SubmissionStatus = "processing" | "completed" | "failed";

type SubmissionRecord = {
	id: string;
	claim_token: string;
	status: SubmissionStatus;
	response: unknown | null;
	updated_at: string;
};

export type RoundSubmissionClaim =
	| { state: "claimed"; submissionId: string; claimToken: string }
	| { state: "completed"; response: unknown | null }
	| { state: "processing" };

const STALE_PROCESSING_MS = 5 * 60 * 1000;

/**
 * Claims the sole settlement slot for a session round.
 *
 * The unique database constraint is the concurrency boundary. A second web or
 * iOS request cannot create a second slot, and therefore cannot settle the
 * round twice. A stale claim can be retried after five minutes.
 */
export async function claimRoundSubmission(
	sessionId: string,
	roundNumber: number,
): Promise<RoundSubmissionClaim> {
	const adminClient = createAdminClient();
	const { data: inserted, error: insertError } = await adminClient
		.from("elo_round_submissions")
		.insert({ session_id: sessionId, round_number: roundNumber })
		.select("id, claim_token")
		.maybeSingle();

	if (inserted) {
		return { state: "claimed", submissionId: inserted.id, claimToken: inserted.claim_token };
	}

	if (insertError?.code !== "23505") {
		throw new Error(
			`Unable to claim ELO round submission: ${insertError?.message ?? "unknown error"}`,
		);
	}

	const { data: existing, error: existingError } = await adminClient
		.from("elo_round_submissions")
		.select("id, claim_token, status, response, updated_at")
		.eq("session_id", sessionId)
		.eq("round_number", roundNumber)
		.single<SubmissionRecord>();

	if (existingError || !existing) {
		throw new Error(
			`Unable to read ELO round submission: ${existingError?.message ?? "not found"}`,
		);
	}

	if (existing.status === "completed") {
		return { state: "completed", response: existing.response };
	}

	const isStale =
		existing.status === "processing" &&
		Date.now() - new Date(existing.updated_at).getTime() > STALE_PROCESSING_MS;

	if (existing.status === "processing" && !isStale) {
		return { state: "processing" };
	}

	const claimToken = crypto.randomUUID();
	let reclaimQuery = adminClient
		.from("elo_round_submissions")
		.update({
			status: "processing",
			claim_token: claimToken,
			error_message: null,
			updated_at: new Date().toISOString(),
		})
		.eq("id", existing.id)
		.eq("status", existing.status)
		.select("id, claim_token");
	if (isStale) reclaimQuery = reclaimQuery.eq("updated_at", existing.updated_at);
	const { data: reclaimed, error: reclaimError } = await reclaimQuery
		.maybeSingle();

	if (reclaimError) {
		throw new Error(`Unable to reclaim ELO round submission: ${reclaimError.message}`);
	}

	return reclaimed
		? { state: "claimed", submissionId: reclaimed.id, claimToken: reclaimed.claim_token }
		: { state: "processing" };
}

export async function failRoundSubmission(
	submissionId: string,
	claimToken: string,
	error: unknown,
) {
	const adminClient = createAdminClient();
	const message = error instanceof Error ? error.message : String(error);
	await adminClient
		.from("elo_round_submissions")
		.update({
			status: "failed",
			error_message: message.slice(0, 1_000),
			updated_at: new Date().toISOString(),
		})
		.eq("id", submissionId)
		.eq("claim_token", claimToken)
		.eq("status", "processing");
}
