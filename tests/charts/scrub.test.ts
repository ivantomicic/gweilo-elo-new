import assert from "node:assert/strict";
import test from "node:test";
import { nearestScrubIndex, scrubDirection } from "../../lib/charts/scrub";

test("scrubbing uses plot coordinates, not the full chart and its axis labels", () => {
	const points = [{ match: 1 }, { match: 2 }, { match: 3 }];
	assert.equal(nearestScrubIndex(points, 57, 57, 300), 0);
	assert.equal(nearestScrubIndex(points, 207, 57, 300), 1);
	assert.equal(nearestScrubIndex(points, 357, 57, 300), 2);
});

test("captured drags clamp to the first and last match outside the chart", () => {
	const points = [{ match: 1 }, { match: 2 }];
	assert.equal(nearestScrubIndex(points, -100, 50, 200), 0);
	assert.equal(nearestScrubIndex(points, 900, 50, 200), 1);
});

test("missing match numbers are selected by distance along the numeric axis", () => {
	const points = [{ match: 1 }, { match: 2 }, { match: 100 }];
	assert.equal(nearestScrubIndex(points, 10, 0, 100), 1);
	assert.equal(nearestScrubIndex(points, 80, 0, 100), 2);
});

test("selection remains accurate with page zoom and fractional plot positions", () => {
	const points = [{ match: 1 }, { match: 2 }, { match: 3 }];
	assert.equal(nearestScrubIndex(points, 200.5, 50.5, 300), 1);
	assert.equal(nearestScrubIndex(points, 401, 101, 600), 1);
});

test("empty or unmeasured charts cannot produce an invalid selected index", () => {
	assert.equal(nearestScrubIndex([], 100, 0, 300), null);
	assert.equal(nearestScrubIndex([{ match: 1 }], 100, 0, 0), null);
	assert.equal(nearestScrubIndex([{ match: 1 }], Number.NaN, 0, 300), null);
	assert.equal(nearestScrubIndex([{ match: 1 }], 100, 0, 300), 0);
});

test("small finger tremors do not start a drag; vertical gestures belong to scrolling", () => {
	assert.equal(scrubDirection("pending", 3, -4), "pending");
	assert.equal(scrubDirection("pending", 3, -10), "vertical");
	assert.equal(scrubDirection("pending", 10, 3), "horizontal");
});

test("a decided direction stays locked when the finger changes direction", () => {
	assert.equal(scrubDirection("horizontal", 8, 40), "horizontal");
	assert.equal(scrubDirection("vertical", 40, 8), "vertical");
});
