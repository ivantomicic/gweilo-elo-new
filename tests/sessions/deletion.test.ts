import assert from "node:assert/strict";
import test from "node:test";
import {
	getSessionDeletionFailure,
	type AtomicSessionDeletionResult,
} from "../../lib/sessions/deletion";

test("accepts dry-run and completed atomic deletion states", () => {
	assert.equal(
		getSessionDeletionFailure({ state: "deletable" }),
		null,
	);
	assert.equal(getSessionDeletionFailure({ state: "deleted" }), null);
});

test("maps every safety refusal to an actionable HTTP response", () => {
	const expected: Array<
		[AtomicSessionDeletionResult["state"], number, RegExp]
	> = [
		["not_found", 404, /not found/i],
		["not_completed", 400, /completed/i],
		["not_latest", 409, /latest/i],
		["active_session_has_results", 409, /active session/i],
		["recalculation_running", 409, /recalculated/i],
		["rating_state_conflict", 409, /ratings/i],
		["snapshot_incomplete", 409, /snapshot/i],
		["invalid_request", 400, /required/i],
	];

	for (const [state, status, message] of expected) {
		const failure = getSessionDeletionFailure({ state });
		assert.equal(failure?.status, status, state);
		assert.match(failure?.error ?? "", message, state);
	}
});
