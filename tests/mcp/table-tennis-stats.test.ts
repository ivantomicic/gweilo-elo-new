import assert from "node:assert/strict";
import test from "node:test";
import {
	summarizeScopedMatches,
	toScopedSinglesMatch,
} from "../../lib/mcp/table-tennis-stats";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OPPONENT_ID = "22222222-2222-4222-8222-222222222222";

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
