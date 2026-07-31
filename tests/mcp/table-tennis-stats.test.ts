import assert from "node:assert/strict";
import test from "node:test";
import {
	aggregateGeneralSinglesStatistics,
	resolveOpponentMatchesByName,
	serializeJsonbPlayerIdsContainment,
	summarizeScopedMatches,
	toScopedSinglesMatch,
	type ScopedSinglesMatch,
} from "../../lib/mcp/table-tennis-stats";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OPPONENT_ID = "22222222-2222-4222-8222-222222222222";
const SECOND_OPPONENT_ID = "33333333-3333-4333-8333-333333333333";
const THIRD_OPPONENT_ID = "44444444-4444-4444-8444-444444444444";

const opponentMatches: ScopedSinglesMatch[] = [
	{
		played_at: "2026-07-30T12:00:00.000Z",
		opponent: {
			id: OPPONENT_ID,
			display_name: "Andrej Jovanović",
		},
		result: "win",
		sets_for: 3,
		sets_against: 1,
	},
	{
		played_at: "2026-07-20T12:00:00.000Z",
		opponent: {
			id: OPPONENT_ID,
			display_name: "Andrej Jovanović",
		},
		result: "loss",
		sets_for: 1,
		sets_against: 3,
	},
	{
		played_at: "2026-07-10T12:00:00.000Z",
		opponent: {
			id: SECOND_OPPONENT_ID,
			display_name: "Marko Andrejić",
		},
		result: "win",
		sets_for: 3,
		sets_against: 0,
	},
];

test("serializes player IDs as JSONB containment input", () => {
	const playerIds = [USER_ID, OPPONENT_ID];
	const serialized = serializeJsonbPlayerIdsContainment(playerIds);

	assert.equal(serialized, `["${USER_ID}","${OPPONENT_ID}"]`);
	assert.deepEqual(JSON.parse(serialized), playerIds);
});

test("formats a match from the authenticated player's perspective", () => {
	const match = toScopedSinglesMatch(
		{
			player_ids: [OPPONENT_ID, USER_ID],
			team1_score: 1,
			team2_score: 3,
			created_at: "2026-07-30T12:00:00.000Z",
		},
		USER_ID,
		"Opponent",
	);

	assert.deepEqual(match, {
		played_at: "2026-07-30T12:00:00.000Z",
		opponent: {
			id: OPPONENT_ID,
			display_name: "Opponent",
		},
		result: "win",
		sets_for: 3,
		sets_against: 1,
	});
});

test("rejects a match that does not contain the authenticated player", () => {
	assert.equal(
		toScopedSinglesMatch(
			{
				player_ids: [
					"33333333-3333-4333-8333-333333333333",
					OPPONENT_ID,
				],
				team1_score: 3,
				team2_score: 0,
				created_at: null,
			},
			USER_ID,
			"Opponent",
		),
		null,
	);
});

test("summarizes wins, losses, draws, and sets", () => {
	const summary = summarizeScopedMatches([
		{
			played_at: null,
			opponent: { id: OPPONENT_ID, display_name: "Opponent" },
			result: "win",
			sets_for: 3,
			sets_against: 1,
		},
		{
			played_at: null,
			opponent: { id: OPPONENT_ID, display_name: "Opponent" },
			result: "loss",
			sets_for: 2,
			sets_against: 3,
		},
		{
			played_at: null,
			opponent: { id: OPPONENT_ID, display_name: "Opponent" },
			result: "draw",
			sets_for: 2,
			sets_against: 2,
		},
	]);

	assert.deepEqual(summary, {
		total_matches: 3,
		wins: 1,
		losses: 1,
		draws: 1,
		win_rate_percent: 33.3,
		sets_won: 7,
		sets_lost: 6,
		set_difference: 1,
	});
});

test("resolves an opponent by an exact name without case or diacritic sensitivity", () => {
	const resolution = resolveOpponentMatchesByName(
		opponentMatches,
		"ANDREJ JOVANOVIC",
	);

	assert.equal(resolution.status, "matched");
	if (resolution.status === "matched") {
		assert.equal(resolution.opponentId, OPPONENT_ID);
		assert.equal(resolution.matches.length, 2);
	}
});

test("resolves a unique opponent by first name", () => {
	const resolution = resolveOpponentMatchesByName(
		opponentMatches,
		"Andrej",
	);

	assert.equal(resolution.status, "matched");
	if (resolution.status === "matched") {
		assert.equal(resolution.opponentId, OPPONENT_ID);
	}
});

test("does not match a name fragment inside another name", () => {
	assert.deepEqual(
		resolveOpponentMatchesByName([opponentMatches[2]], "Andrej"),
		{ status: "not_found" },
	);
});

test("reports ambiguous opponents and requires a fuller name", () => {
	const resolution = resolveOpponentMatchesByName(
		[
			...opponentMatches,
			{
				played_at: null,
				opponent: {
					id: "44444444-4444-4444-8444-444444444444",
					display_name: "Andrej Petrović",
				},
				result: "draw",
				sets_for: 2,
				sets_against: 2,
			},
		],
		"Andrej",
	);

	assert.equal(resolution.status, "ambiguous");
	if (resolution.status === "ambiguous") {
		assert.deepEqual(
			resolution.candidates.map(
				(candidate) => candidate.display_name,
			),
			["Andrej Jovanović", "Andrej Petrović"],
		);
	}
});

test("does not resolve players absent from the authenticated player's matches", () => {
	assert.deepEqual(
		resolveOpponentMatchesByName(opponentMatches, "Nikola"),
		{ status: "not_found" },
	);
});

test("ranks period statistics by win rate for best-performance questions", () => {
	const result = aggregateGeneralSinglesStatistics({
		matches: [
			{
				player_ids: [USER_ID, OPPONENT_ID],
				team1_score: 3,
				team2_score: 1,
				created_at: null,
			},
			{
				player_ids: [USER_ID, SECOND_OPPONENT_ID],
				team1_score: 2,
				team2_score: 2,
				created_at: null,
			},
			{
				player_ids: [OPPONENT_ID, SECOND_OPPONENT_ID],
				team1_score: 2,
				team2_score: 2,
				created_at: null,
			},
		],
		profiles: new Map([
			[USER_ID, "Ivan"],
			[OPPONENT_ID, "Andrej"],
			[SECOND_OPPONENT_ID, "Marko"],
		]),
		sortBy: "win_rate",
		minimumMatches: 2,
		limit: 10,
	});

	assert.equal(result.total_eligible_players, 3);
	assert.deepEqual(
		result.players.map((player) => player.display_name),
		["Ivan", "Marko", "Andrej"],
	);
	assert.deepEqual(result.players[0], {
		rank: 1,
		display_name: "Ivan",
		matches_played: 2,
		wins: 1,
		losses: 0,
		draws: 1,
		win_rate_percent: 50,
		sets_won: 5,
		sets_lost: 3,
		set_difference: 2,
	});
});

test("ranks period statistics by draws and applies limits", () => {
	const result = aggregateGeneralSinglesStatistics({
		matches: [
			{
				player_ids: [USER_ID, OPPONENT_ID],
				team1_score: 2,
				team2_score: 2,
				created_at: null,
			},
			{
				player_ids: [USER_ID, SECOND_OPPONENT_ID],
				team1_score: 3,
				team2_score: 1,
				created_at: null,
			},
			{
				player_ids: [OPPONENT_ID, SECOND_OPPONENT_ID],
				team1_score: 1,
				team2_score: 1,
				created_at: null,
			},
			{
				player_ids: [OPPONENT_ID, THIRD_OPPONENT_ID],
				team1_score: 2,
				team2_score: 2,
				created_at: null,
			},
		],
		profiles: new Map([
			[USER_ID, "Ivan"],
			[OPPONENT_ID, "Andrej"],
			[SECOND_OPPONENT_ID, "Marko"],
			[THIRD_OPPONENT_ID, "Nikola"],
		]),
		sortBy: "draws",
		minimumMatches: 1,
		limit: 2,
	});

	assert.equal(result.total_eligible_players, 4);
	assert.equal(result.players.length, 2);
	assert.equal(result.players[0].display_name, "Andrej");
	assert.equal(result.players[0].draws, 3);
});
