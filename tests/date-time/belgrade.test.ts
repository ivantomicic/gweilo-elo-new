import assert from "node:assert/strict";
import test from "node:test";
import {
	formatBelgradeDate,
	formatBelgradeTime,
	getBelgradeDayBounds,
	parseStoredUTCTimestamp,
} from "../../lib/date-time/belgrade";

test("treats legacy offset-less activity timestamps as UTC", () => {
	const stored = "2026-08-25T10:52:06.738";

	assert.equal(
		parseStoredUTCTimestamp(stored).toISOString(),
		"2026-08-25T10:52:06.738Z",
	);
	assert.equal(formatBelgradeDate(stored), "25.08.2026");
	assert.equal(formatBelgradeTime(stored), "12:52:06");
});

test("keeps offset-aware timestamps as the same instant", () => {
	assert.equal(
		parseStoredUTCTimestamp("2026-08-25T10:52:06.738+00:00").toISOString(),
		"2026-08-25T10:52:06.738Z",
	);
});

test("builds Belgrade date filters with daylight-saving offsets", () => {
	assert.deepEqual(getBelgradeDayBounds("2026-08-25"), {
		start: "2026-08-24T22:00:00.000Z",
		endExclusive: "2026-08-25T22:00:00.000Z",
	});
	assert.deepEqual(getBelgradeDayBounds("2026-01-15"), {
		start: "2026-01-14T23:00:00.000Z",
		endExclusive: "2026-01-15T23:00:00.000Z",
	});
});

test("handles the short and long Belgrade DST days", () => {
	assert.deepEqual(getBelgradeDayBounds("2026-03-29"), {
		start: "2026-03-28T23:00:00.000Z",
		endExclusive: "2026-03-29T22:00:00.000Z",
	});
	assert.deepEqual(getBelgradeDayBounds("2026-10-25"), {
		start: "2026-10-24T22:00:00.000Z",
		endExclusive: "2026-10-25T23:00:00.000Z",
	});
});
