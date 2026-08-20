import assert from "node:assert/strict";
import test from "node:test";
import {
	currentPendingRoundNumber,
	displayMatchOrder,
	isValidFinalSetScore,
	roundMatches,
	roundSubmission,
	totalRoundCount,
	type ScorekeeperMatchRow,
} from "../../lib/sessions/scorekeeper";

test("converts zero-based storage order to human-facing match numbers", () => {
	assert.equal(displayMatchOrder(0), 1);
	assert.equal(displayMatchOrder(4), 5);
});

test("accepts decisive and drawn final set totals", () => {
	assert.equal(isValidFinalSetScore(3, 1), true);
	assert.equal(isValidFinalSetScore(0, 1), true);
	assert.equal(isValidFinalSetScore(0, 0), true);
	assert.equal(isValidFinalSetScore(2, 2), true);
	assert.equal(isValidFinalSetScore(-1, 3), false);
	assert.equal(isValidFinalSetScore(1.5, 3), false);
});

const matches: ScorekeeperMatchRow[] = [
	{
		id: "completed",
		round_number: 1,
		match_order: 1,
		status: "completed",
		team1_score: 3,
		team2_score: 1,
	},
	{
		id: "second",
		round_number: 2,
		match_order: 2,
		status: "pending",
		team1_score: null,
		team2_score: null,
	},
	{
		id: "first",
		round_number: 2,
		match_order: 1,
		status: "pending",
		team1_score: 2,
		team2_score: 2,
	},
	{
		id: "future",
		round_number: 3,
		match_order: 1,
		status: "pending",
		team1_score: null,
		team2_score: null,
	},
];

test("finds and orders the current pending round", () => {
	assert.equal(currentPendingRoundNumber(matches), 2);
	assert.equal(totalRoundCount(matches), 3);
	assert.deepEqual(
		roundMatches(matches, 2).map((match) => match.id),
		["first", "second"],
	);
});

test("does not submit an incomplete round", () => {
	assert.equal(roundSubmission(roundMatches(matches, 2)), null);
});

test("builds a complete submission in match order", () => {
	const complete = matches.map((match) =>
		match.id === "second"
			? { ...match, team1_score: 3, team2_score: 0 }
			: match,
	);

	assert.deepEqual(roundSubmission(roundMatches(complete, 2)), [
		{ matchId: "first", team1Score: 2, team2Score: 2 },
		{ matchId: "second", team1Score: 3, team2Score: 0 },
	]);
});
