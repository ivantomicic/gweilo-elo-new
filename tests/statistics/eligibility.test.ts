import assert from "node:assert/strict";
import test from "node:test";
import {
	isRankingEligible,
	STATISTICS_ELIGIBILITY,
} from "../../lib/statistics/eligibility";

test("ranking eligibility requires both enough matches and recent activity", () => {
	const activeEntityIds = new Set(["active-player", "short-career"]);

	assert.equal(
		isRankingEligible({
			entityId: "active-player",
			matchesPlayed: 15,
			activeEntityIds,
			minimumMatches: 15,
		}),
		true
	);
	assert.equal(
		isRankingEligible({
			entityId: "inactive-player",
			matchesPlayed: 100,
			activeEntityIds,
			minimumMatches: 15,
		}),
		false
	);
	assert.equal(
		isRankingEligible({
			entityId: "short-career",
			matchesPlayed: 14,
			activeEntityIds,
			minimumMatches: 15,
		}),
		false
	);
});

test("shared eligibility contract exposes every leaderboard rule", () => {
	assert.deepEqual(STATISTICS_ELIGIBILITY, {
		singles: {
			minimumMatches: 15,
			maximumInactivityDays: 28,
		},
		doublesPlayers: {
			minimumMatches: 6,
			maximumInactivityDays: 56,
		},
		doublesTeams: {
			minimumMatches: 6,
			maximumInactivityDays: 56,
		},
	});
});
