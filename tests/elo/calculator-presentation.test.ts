import assert from "node:assert/strict";
import test from "node:test";
import {
	eloDeltaClass,
	formatDelta,
	formatElo,
	opponentLabel,
} from "../../app/calculator/_lib/utils";

test("calculator uses native signed rounding, including negative half points", () => {
	assert.equal(formatDelta(6.5), "+7");
	assert.equal(formatDelta(-6.5), "-7");
	assert.equal(formatDelta(0.49), "0");
	assert.equal(formatDelta(-0.49), "0");
	assert.equal(formatDelta(0), "0");
});

test("calculator formats Elo with Serbian grouping and no fractions", () => {
	assert.equal(formatElo(1813.2), "1.813");
	assert.equal(formatElo(1990.7), "1.991");
});

test("calculator retains native positive, negative and neutral color thresholds", () => {
	assert.match(eloDeltaClass(0.005), /lime/);
	assert.match(eloDeltaClass(-0.005), /coral/);
	assert.match(eloDeltaClass(0.004), /amber/);
	assert.match(eloDeltaClass(-0.004), /amber/);
});

test("calculator uses the same opponent count copy as native", () => {
	assert.equal(opponentLabel(1), "protivnik");
	assert.equal(opponentLabel(2), "protivnika");
	assert.equal(opponentLabel(11), "protivnika");
});
