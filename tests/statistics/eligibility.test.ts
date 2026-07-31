import assert from "node:assert/strict";
import test from "node:test";
import {
	isDoublesTeamRankingEligible,
	isPlayerRankingEligible,
	isRankingEligible,
	STATISTICS_ELIGIBILITY,
} from "../../lib/statistics/eligibility";
import { isRankedPlayerAccount } from "../../lib/auth/roles";

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

test("guest and access-disabled accounts are not ranked", () => {
	assert.equal(
		isRankedPlayerAccount({ app_metadata: { role: "guest" } }),
		false,
	);
	assert.equal(
		isRankedPlayerAccount({
			app_metadata: { role: "user", access_disabled: true },
		}),
		false,
	);
	assert.equal(
		isRankedPlayerAccount({ app_metadata: { role: "user" } }),
		true,
	);
});

test("player ranking requires an account eligible for ranking", () => {
	assert.equal(
		isPlayerRankingEligible({
			playerId: "guest",
			matchesPlayed: 30,
			activePlayerIds: new Set(["guest"]),
			rankedPlayerIds: new Set(["user"]),
			minimumMatches: 15,
		}),
		false,
	);
});

test("a doubles team is hidden when either member is not ranked", () => {
	const base = {
		teamId: "team",
		player1Id: "user",
		player2Id: "guest",
		matchesPlayed: 20,
		activeTeamIds: new Set(["team"]),
		minimumMatches: 6,
	};

	assert.equal(
		isDoublesTeamRankingEligible({
			...base,
			rankedPlayerIds: new Set(["user"]),
		}),
		false,
	);
	assert.equal(
		isDoublesTeamRankingEligible({
			...base,
			rankedPlayerIds: new Set(["user", "guest"]),
		}),
		true,
	);
});
