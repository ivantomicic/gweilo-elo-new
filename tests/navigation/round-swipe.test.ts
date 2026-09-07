import assert from "node:assert/strict";
import test from "node:test";
import { getRoundSwipeAxis, getRoundSwipeDirection, isRoundSwipeAtRest } from "../../lib/navigation/round-swipe";

const start = { x: 200, y: 300 };

test("a settled percentage transition accepts the next swipe", () => {
	for (const offset of [0, "0%", "0px", 0.001]) {
		assert.equal(isRoundSwipeAtRest(offset), true);
	}
	for (const offset of [-80, "100%", "-20px", "invalid"]) {
		assert.equal(isRoundSwipeAtRest(offset), false);
	}
});

test("horizontal swipes browse the previous and next rounds", () => {
	assert.equal(getRoundSwipeDirection(start, { x: 80, y: 305 }), "next");
	assert.equal(getRoundSwipeDirection(start, { x: 320, y: 295 }), "previous");
});

test("taps and short drags do not change rounds", () => {
	assert.equal(getRoundSwipeAxis(start, { x: 204, y: 305 }), null);
	assert.equal(getRoundSwipeDirection(start, start), null);
	assert.equal(getRoundSwipeDirection(start, { x: 250, y: 300 }), null);
});

test("vertical scrolls and ambiguous diagonals do not navigate", () => {
	assert.equal(getRoundSwipeAxis(start, { x: 205, y: 320 }), "vertical");
	assert.equal(getRoundSwipeDirection(start, { x: 260, y: 500 }), null);
	assert.equal(getRoundSwipeDirection(start, { x: 260, y: 245 }), null);
});

test("direction depends on movement, including a swipe across the page margins", () => {
	assert.equal(getRoundSwipeDirection({ x: 374, y: 780 }, { x: 10, y: 780 }), "next");
	assert.equal(getRoundSwipeDirection({ x: 4, y: 60 }, { x: 180, y: 62 }), "previous");
});
