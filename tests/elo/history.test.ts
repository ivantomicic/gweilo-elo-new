import assert from "node:assert/strict";
import test from "node:test";
import { buildEloHistoryMatchPerspective } from "../../lib/elo/history";

test("returns a win and scores from the first player's perspective", () => {
	assert.deepEqual(buildEloHistoryMatchPerspective(true, 3, 1), {
		scoreFor: 3,
		scoreAgainst: 1,
		result: "win",
	});
});

test("reverses scores and result for the second player's perspective", () => {
	assert.deepEqual(buildEloHistoryMatchPerspective(false, 3, 1), {
		scoreFor: 1,
		scoreAgainst: 3,
		result: "loss",
	});
});

test("uses the actual score to preserve draws regardless of Elo movement", () => {
	assert.deepEqual(buildEloHistoryMatchPerspective(false, 2, 2), {
		scoreFor: 2,
		scoreAgainst: 2,
		result: "draw",
	});
});

test("keeps the result unknown when a score is missing", () => {
	assert.deepEqual(buildEloHistoryMatchPerspective(true, 3, null), {
		scoreFor: 3,
		scoreAgainst: null,
		result: null,
	});
});
