import assert from "node:assert/strict";
import test from "node:test";
import { renderMissionCopy } from "../../lib/rivalries/copy";
import { getSinglesWinnerId } from "../../lib/rivalries/match-result";
import {
	sanitizeStoredMissions,
	selectMissionCandidates,
} from "../../lib/rivalries/mission-selection";
import type {
	GeneratedMission,
	MissionCandidate,
	MissionType,
} from "../../lib/rivalries/types";

function candidate(
	id: string,
	type: MissionType,
	opponentId: string,
	score: number,
	priorityBucket: MissionCandidate["priorityBucket"],
): MissionCandidate {
	return {
		id,
		type,
		priorityBucket,
		title: id,
		body: "",
		opponentId,
		opponentName: opponentId,
		basePriority: score,
		score,
		scoreBreakdown: {
			basePriority: score,
			closeness: 0,
			recency: 0,
			realism: 0,
			tierFit: 0,
			total: score,
		},
		reasoning: [],
		metrics: {},
		selected: false,
	};
}

test("mission selection never repeats an objective or opponent", () => {
	const result = selectMissionCandidates([
		candidate("climb:a", "climb_rank", "a", 120, "competitive"),
		candidate("defend:a", "defend_rank", "a", 119, "competitive"),
		candidate("climb:b", "climb_rank", "b", 118, "competitive"),
		candidate("duel:c", "settle_score", "c", 117, "story"),
	]);

	assert.equal(result.missions.length, 2);
	assert.deepEqual(
		result.missions.map((mission) => mission.id),
		["climb:a", "duel:c"],
	);
	assert.equal(new Set(result.missions.map((mission) => mission.type)).size, 2);
	assert.equal(new Set(result.missions.map((mission) => mission.opponentId)).size, 2);
});

test("duplicate candidates retain only the strongest version", () => {
	const result = selectMissionCandidates([
		candidate("old", "settle_score", "a", 100, "story"),
		candidate("new", "settle_score", "a", 130, "story"),
	]);

	assert.equal(result.candidates.length, 1);
	assert.equal(result.candidates[0].id, "new");
	assert.equal(result.missions[0].id, "new");
});

test("legacy duplicate missions are removed before homepage delivery", () => {
	const missions = [
		candidate("one", "climb_rank", "a", 100, "competitive"),
		candidate("two", "defend_rank", "a", 99, "competitive"),
		candidate("three", "climb_rank", "b", 98, "competitive"),
		candidate("four", "settle_score", "c", 97, "story"),
	].map(({ selected: _selected, ...mission }) => mission as GeneratedMission);

	assert.deepEqual(
		sanitizeStoredMissions(missions).map((mission) => mission.id),
		["one", "four"],
	);
});

test("head-to-head winner always follows the current match score", () => {
	assert.equal(getSinglesWinnerId("player-a", "player-b", 11, 8), "player-a");
	assert.equal(getSinglesWinnerId("player-a", "player-b", 7, 11), "player-b");
	assert.equal(getSinglesWinnerId("player-a", "player-b", 10, 10), null);
});

test("mission copy uses the stored instrumental name and configured wording", () => {
	const copy = renderMissionCopy({
		type: "settle_score",
		opponentName: "Gara",
		opponentNameCases: { instrumental: "Garom" },
		metrics: { wins: 15, losses: 15 },
		title: "",
		body: "",
	});

	assert.equal(copy.title, "Duel sa Garom");
	assert.equal(
		copy.body,
		"Međusobni rezultat je 15–15. Reguliši to na sledećem terminu.",
	);
});

test("mission copy falls back to the display name when a case is missing", () => {
	const copy = renderMissionCopy({
		type: "settle_score",
		opponentName: "Chen",
		metrics: { wins: 2, losses: 1 },
		title: "",
		body: "",
	});

	assert.equal(copy.title, "Duel sa Chen");
});
