import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPreferredRound5SinglesTeam } from "../../lib/sessions/round5-team";

const teams = {
	A: ["a", "b"] as [string, string],
	B: ["c", "d"] as [string, string],
	C: ["e", "f"] as [string, string],
};

describe("six-player Round 5 fairness", () => {
	it("avoids the pairs most represented in recent sessions", () => {
		assert.equal(
			getPreferredRound5SinglesTeam(teams, [
				["a", "b"],
				["c", "d"],
			]),
			"C",
		);
	});

	it("uses stable team order when there is no history", () => {
		assert.equal(getPreferredRound5SinglesTeam(teams, []), "A");
	});
});
