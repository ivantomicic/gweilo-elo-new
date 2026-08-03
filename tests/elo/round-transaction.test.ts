import assert from "node:assert/strict";
import test from "node:test";
import {
	buildAtomicRoundPlan,
	type AtomicMatch,
	type RatingInput,
} from "../../lib/elo/round-transaction";

const blank = (kind: RatingInput["kind"], entityId: string): RatingInput => ({
	kind,
	entityId,
	state: {
		exists: false,
		elo: 1500,
		matches_played: 0,
		wins: 0,
		losses: 0,
		draws: 0,
		sets_won: 0,
		sets_lost: 0,
	},
});

test("builds complete singles ratings, history, snapshots, and match writes", () => {
	const matches: AtomicMatch[] = [{
		id: "match-1",
		match_type: "singles",
		player_ids: ["alice", "bob"],
		team_1_id: null,
		team_2_id: null,
		match_order: 1,
	}];
	const plan = buildAtomicRoundPlan({
		matches,
		displayScores: new Map([["match-1", { team1Score: 3, team2Score: 1 }]]),
		applyRatings: true,
		ratingInputs: [blank("player_singles", "alice"), blank("player_singles", "bob")],
	});

	assert.deepEqual(plan.matches[0], { match_id: "match-1", team1_score: 3, team2_score: 1 });
	assert.equal(plan.ratings.length, 2);
	assert.equal(plan.ratings.find((row) => row.entity_id === "alice")?.after.elo, 1520);
	assert.equal(plan.ratings.find((row) => row.entity_id === "bob")?.after.elo, 1480);
	assert.equal(plan.history.length, 1);
	assert.equal(plan.snapshots.length, 2);
});

test("keeps displayed five-player score separate from combined ELO score", () => {
	const matches: AtomicMatch[] = [{
		id: "settlement-match",
		match_type: "singles",
		player_ids: ["alice", "bob"],
		team_1_id: null,
		team_2_id: null,
		match_order: 1,
	}];
	const plan = buildAtomicRoundPlan({
		matches,
		displayScores: new Map([["settlement-match", { team1Score: 1, team2Score: 2 }]]),
		eloScores: new Map([["settlement-match", { team1Score: 4, team2Score: 3 }]]),
		applyRatings: true,
		ratingInputs: [blank("player_singles", "alice"), blank("player_singles", "bob")],
	});

	assert.equal(plan.matches[0].team1_score, 1);
	assert.ok((plan.history[0].player1_elo_delta as number) > 0);
	assert.equal(plan.ratings.find((row) => row.entity_id === "alice")?.after.sets_won, 4);
});

test("deferred rounds write scores without producing ELO mutations", () => {
	const matches: AtomicMatch[] = [{
		id: "deferred",
		match_type: "singles",
		player_ids: ["alice", "bob"],
		team_1_id: null,
		team_2_id: null,
		match_order: 1,
	}];
	const plan = buildAtomicRoundPlan({
		matches,
		displayScores: new Map([["deferred", { team1Score: 2, team2Score: 2 }]]),
		applyRatings: false,
		ratingInputs: [],
	});
	assert.equal(plan.matches.length, 1);
	assert.equal(plan.ratings.length, 0);
	assert.equal(plan.history.length, 0);
	assert.equal(plan.snapshots.length, 0);
});

test("unrated matches write scores while rated matches in the same round still update ELO", () => {
	const matches: AtomicMatch[] = [
		{
			id: "exhibition",
			match_type: "singles",
			player_ids: ["placeholder", "alice"],
			team_1_id: null,
			team_2_id: null,
			match_order: 0,
			is_rated: false,
		},
		{
			id: "competitive",
			match_type: "singles",
			player_ids: ["bob", "carol"],
			team_1_id: null,
			team_2_id: null,
			match_order: 1,
			is_rated: true,
		},
	];
	const plan = buildAtomicRoundPlan({
		matches,
		displayScores: new Map([
			["exhibition", { team1Score: 3, team2Score: 0 }],
			["competitive", { team1Score: 3, team2Score: 2 }],
		]),
		ratingInputs: [
			blank("player_singles", "bob"),
			blank("player_singles", "carol"),
		],
	});

	assert.equal(plan.matches.length, 2);
	assert.equal(plan.history.length, 1);
	assert.equal(plan.history[0].match_id, "competitive");
	assert.equal(plan.ratings.length, 2);
	assert.equal(plan.snapshots.length, 2);
});

test("builds both independent doubles rating systems", () => {
	const matches: AtomicMatch[] = [{
		id: "doubles",
		match_type: "doubles",
		player_ids: ["a", "b", "c", "d"],
		team_1_id: "team-ab",
		team_2_id: "team-cd",
		match_order: 1,
	}];
	const plan = buildAtomicRoundPlan({
		matches,
		displayScores: new Map([["doubles", { team1Score: 3, team2Score: 2 }]]),
		applyRatings: true,
		ratingInputs: [
			blank("double_team", "team-ab"),
			blank("double_team", "team-cd"),
			...matches[0].player_ids.map((id) => blank("player_doubles", id)),
		],
	});
	assert.equal(plan.ratings.length, 6);
	assert.equal(plan.history.length, 1);
	assert.equal(plan.snapshots.length, 4);
	assert.equal(plan.ratings.find((row) => row.entity_id === "a")?.after.elo, 1520);
	assert.equal(plan.ratings.find((row) => row.entity_id === "team-ab")?.after.elo, 1520);
});
