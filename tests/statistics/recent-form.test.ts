import assert from "node:assert/strict";
import test from "node:test";
import { getRecentSessionForm } from "../../lib/statistics/recent-form";

test("profile classifies normalized scores, not raw Elo thresholds", () => {
	const result = getRecentSessionForm([21, -21, 16, -10, 18], [1, -0.8, 0.5, -0.3, 0.3]);
	assert.deepEqual(result.map((entry) => entry?.band), ["good", "bad", "good", "bad", "good"]);
	assert.deepEqual(result.map((entry) => entry?.delta), [21, -21, 16, -10, 18]);
});

test("normalized neutral scores remain neutral even when Elo gains are large", () => {
	assert.equal(getRecentSessionForm([12], [0.1]).at(-1)?.band, "neutral");
});

test("missing or mismatched scores use the same Elo fallback as statistics", () => {
	for (const scores of [undefined, [1], [NaN, NaN, NaN]]) {
		assert.deepEqual(getRecentSessionForm([-3, 0, 3], scores).slice(-3).map((entry) => entry?.band), ["bad", "neutral", "good"]);
	}
});

test("keeps the latest five sessions in order and pads short or empty history", () => {
	assert.deepEqual(getRecentSessionForm([1, 2, 3, 4, 5, 6]).map((entry) => entry?.delta), [2, 3, 4, 5, 6]);
	assert.deepEqual(getRecentSessionForm([]), [null, null, null, null, null]);
	assert.deepEqual(getRecentSessionForm([NaN, 2]).slice(0, 4), [null, null, null, null]);
});
