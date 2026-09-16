import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildSixPlayerFutureRoundPlan,
	type SixPlayerScheduleMatch,
} from "../../lib/sessions/six-player-future-rounds";

const matches: SixPlayerScheduleMatch[] = [
	{ id: "5d", round_number: 5, match_type: "doubles", player_ids: ["a", "b", "c", "d"], status: "pending" },
	{ id: "5s", round_number: 5, match_type: "singles", player_ids: ["e", "f"], status: "pending" },
	{ id: "6d", round_number: 6, match_type: "doubles", player_ids: [], status: "pending" },
	{ id: "6s", round_number: 6, match_type: "singles", player_ids: [], status: "pending" },
	{ id: "7d", round_number: 7, match_type: "doubles", player_ids: [], status: "pending" },
	{ id: "7s", round_number: 7, match_type: "singles", player_ids: [], status: "pending" },
];

describe("six-player future round plan", () => {
	it("assigns winners and losers to both future rounds", async () => {
		const resolved: string[] = [];
		const plan = await buildSixPlayerFutureRoundPlan({
			matches,
			doublesTeamOneScore: 3,
			doublesTeamTwoScore: 1,
			placeholderIds: new Set(),
			resolveDoublesTeam: async (first, second) => {
				resolved.push(`${first}-${second}`);
				return `${first}-${second}`;
			},
		});
		assert.deepEqual(plan.map((match) => [match.match_id, match.player_ids]), [
			["6d", ["a", "b", "e", "f"]],
			["6s", ["c", "d"]],
			["7d", ["c", "d", "e", "f"]],
			["7s", ["a", "b"]],
		]);
		assert.deepEqual(resolved, ["a-b", "e-f", "c-d"]);
		assert.equal(plan[2].team_2_id, "e-f");
	});

	it("keeps placeholder matches unrated and preserves the legacy tie branch", async () => {
		const plan = await buildSixPlayerFutureRoundPlan({
			matches,
			doublesTeamOneScore: 2,
			doublesTeamTwoScore: 2,
			placeholderIds: new Set(["e"]),
			resolveDoublesTeam: async (first, second) => `${first}-${second}`,
		});
		assert.deepEqual(plan[0].player_ids, ["c", "d", "e", "f"]);
		assert.equal(plan[0].is_rated, false);
		assert.equal(plan[0].team_1_id, null);
		assert.equal(plan[0].team_2_id, null);
		assert.equal(plan[1].is_rated, true);
	});

	it("rejects a missing or already completed future match", async () => {
		await assert.rejects(() => buildSixPlayerFutureRoundPlan({
			matches: matches.slice(0, -1),
			doublesTeamOneScore: 3,
			doublesTeamTwoScore: 1,
			placeholderIds: new Set(),
			resolveDoublesTeam: async () => "team",
		}), /Expected one singles match in Round 7/);
	});
});
