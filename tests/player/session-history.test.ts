import assert from "node:assert/strict";
import test from "node:test";

import {
	serbianMatchCount,
	summarizePlayerSessions,
} from "../../lib/player/session-history";

test("groups matches by session and sums committed Elo deltas", () => {
	const summaries = summarizePlayerSessions([
		{ match: 1, sessionId: "older", date: "2026-08-20T18:00:00Z", elo: 1508, delta: 8, result: "win" },
		{ match: 2, sessionId: "latest", date: "2026-08-27T18:00:00Z", elo: 1515, delta: 7, result: "win" },
		{ match: 3, sessionId: "latest", date: "2026-08-27T18:00:00Z", elo: 1511, delta: -4, result: "loss" },
		{ match: 4, sessionId: "latest", date: "2026-08-27T18:00:00Z", elo: 1511, delta: 0, result: "draw" },
	]);

	assert.equal(summaries.length, 2);
	assert.deepEqual(summaries[0], {
		key: "session:latest",
		sessionId: "latest",
		date: "2026-08-27T18:00:00Z",
		matchCount: 3,
		wins: 1,
		draws: 1,
		losses: 1,
		eloDelta: 3,
		endingElo: 1511,
	});
	assert.equal(summaries[1].sessionId, "older");
});

test("keeps legacy matches separate when no session ID is available", () => {
	const summaries = summarizePlayerSessions([
		{ match: 1, date: "2026-08-20T18:00:00Z", elo: 1504, delta: 4, result: "win" },
		{ match: 2, date: "2026-08-20T18:00:00Z", elo: 1500, delta: -4, result: "loss" },
	]);

	assert.equal(summaries.length, 2);
	assert.equal(summaries[0].key, "legacy-match:2");
	assert.equal(summaries[1].key, "legacy-match:1");
});

test("ignores the baseline point and rounds only the finished session total", () => {
	const summaries = summarizePlayerSessions([
		{ match: 0, date: "2026-08-20T18:00:00Z", elo: 1500, delta: 100 },
		{ match: 1, sessionId: "one", date: "2026-08-21T18:00:00Z", elo: 1500.4, delta: 0.4, result: "draw" },
		{ match: 2, sessionId: "one", date: "2026-08-21T18:00:00Z", elo: 1500.8, delta: 0.4, result: "draw" },
	]);

	assert.equal(summaries.length, 1);
	assert.equal(summaries[0].eloDelta, 1);
	assert.equal(summaries[0].draws, 2);
});

test("formats Serbian match-count forms", () => {
	assert.equal(serbianMatchCount(1), "1 meč");
	assert.equal(serbianMatchCount(2), "2 meča");
	assert.equal(serbianMatchCount(4), "4 meča");
	assert.equal(serbianMatchCount(5), "5 mečeva");
	assert.equal(serbianMatchCount(11), "11 mečeva");
	assert.equal(serbianMatchCount(22), "22 meča");
});
