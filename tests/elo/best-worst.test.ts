import assert from "node:assert/strict";
import test from "node:test";
import { aggregateBestWorstEloTotals } from "../../lib/elo/best-worst";

test("sums committed deltas and ignores players outside completed singles", () => {
	const result = aggregateBestWorstEloTotals(["a", "b", "c"], [
		{
			player1_id: "a",
			player1_elo_delta: "7.5",
			player2_id: "b",
			player2_elo_delta: -7,
		},
		{
			player1_id: "a",
			player1_elo_delta: 2.25,
			player2_id: "c",
			player2_elo_delta: -2.5,
		},
		{
			player1_id: "not-in-session",
			player1_elo_delta: 100,
			player2_id: null,
			player2_elo_delta: null,
		},
	]);

	assert.deepEqual(result.best, { playerId: "a", eloChange: 9.75 });
	assert.deepEqual(result.worst, { playerId: "b", eloChange: -7 });
});

test("uses the lowest player ID independently for best and worst ties", () => {
	const result = aggregateBestWorstEloTotals(["d", "b", "c", "a"], [
		{
			player1_id: "a",
			player1_elo_delta: 5,
			player2_id: "b",
			player2_elo_delta: 5,
		},
		{
			player1_id: "c",
			player1_elo_delta: -4,
			player2_id: "d",
			player2_elo_delta: -4,
		},
	]);

	assert.deepEqual(result.best, { playerId: "a", eloChange: 5 });
	assert.deepEqual(result.worst, { playerId: "c", eloChange: -4 });
});

test("keeps eligible players at zero when no Elo history was committed", () => {
	const result = aggregateBestWorstEloTotals(["b", "a"], []);

	assert.deepEqual(result.best, { playerId: "a", eloChange: 0 });
	assert.deepEqual(result.worst, { playerId: "a", eloChange: 0 });
});

test("returns nulls when there are no completed singles players", () => {
	assert.deepEqual(aggregateBestWorstEloTotals([], []), {
		best: null,
		worst: null,
	});
});
