import assert from "node:assert/strict";
import test from "node:test";
import {
	calculateDoublesPlayerDeltas,
	calculateEloDelta,
	calculateExpectedScore,
	calculateKFactor,
} from "../../lib/elo/calculation";

test("uses the documented K-factor thresholds", () => {
	assert.equal(calculateKFactor(0), 40);
	assert.equal(calculateKFactor(9), 40);
	assert.equal(calculateKFactor(10), 32);
	assert.equal(calculateKFactor(39), 32);
	assert.equal(calculateKFactor(40), 24);
});

test("gives equal-rated players a 50% expected score", () => {
	assert.equal(calculateExpectedScore(1500, 1500), 0.5);
});

test("is zero-sum when both participants have the same K-factor", () => {
	const winnerDelta = calculateEloDelta(1500, 1500, "win", 12);
	const loserDelta = calculateEloDelta(1500, 1500, "loss", 12);

	assert.equal(winnerDelta, 16);
	assert.equal(loserDelta, -16);
	assert.equal(winnerDelta + loserDelta, 0);
});

test("intentionally moves the rating pool when participants have different K-factors", () => {
	const newPlayerWin = calculateEloDelta(1500, 1500, "win", 3);
	const establishedPlayerLoss = calculateEloDelta(1500, 1500, "loss", 55);

	assert.equal(newPlayerWin, 20);
	assert.equal(establishedPlayerLoss, -12);
	assert.equal(newPlayerWin + establishedPlayerLoss, 8);
});

test("rewards an upset more than an expected win", () => {
	const expectedWin = calculateEloDelta(1800, 1200, "win", 12);
	const upsetWin = calculateEloDelta(1200, 1800, "win", 12);

	assert.ok(upsetWin > expectedWin);
	assert.ok(expectedWin > 0);
});

test("draws move the higher-rated player down and lower-rated player up", () => {
	const higherRatedDraw = calculateEloDelta(1700, 1300, "draw", 12);
	const lowerRatedDraw = calculateEloDelta(1300, 1700, "draw", 12);

	assert.ok(higherRatedDraw < 0);
	assert.ok(lowerRatedDraw > 0);
	assert.equal(higherRatedDraw + lowerRatedDraw, 0);
});

test("uses average player doubles ratings and applies one delta to each teammate", () => {
	const result = calculateDoublesPlayerDeltas(
		[
			{ elo: 1600, matchCount: 12 },
			{ elo: 1400, matchCount: 12 },
		],
		[
			{ elo: 1500, matchCount: 12 },
			{ elo: 1500, matchCount: 12 },
		],
		"win",
	);

	assert.equal(result.team1AverageElo, 1500);
	assert.equal(result.team2AverageElo, 1500);
	assert.equal(result.team1Delta, 16);
	assert.equal(result.team2Delta, -16);
});
