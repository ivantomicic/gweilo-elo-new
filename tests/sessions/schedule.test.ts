import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	generateSchedule,
	type SessionPlayer,
	type SessionRound,
} from "../../lib/sessions/schedule";

const players: SessionPlayer[] = Array.from({ length: 6 }, (_, index) => ({
	id: String.fromCharCode(65 + index),
	name: String.fromCharCode(65 + index),
	avatar: null,
}));

function singlesPairs(rounds: SessionRound[]): string[] {
	return rounds.flatMap((round) =>
		round.matches
			.filter((match) => match.type === "singles")
			.map((match) => match.players.map((player) => player.id).sort().join("")),
	);
}

describe("shared session schedule", () => {
	it("creates the single head-to-head match for two players", () => {
		const rounds = generateSchedule(players.slice(0, 2));

		assert.equal(rounds.length, 1);
		assert.deepEqual(singlesPairs(rounds), ["AB"]);
	});

	it("covers each three-player pairing once", () => {
		const pairs = singlesPairs(generateSchedule(players.slice(0, 3)));

		assert.equal(pairs.length, 3);
		assert.deepEqual(new Set(pairs), new Set(["AB", "AC", "BC"]));
	});

	it("respects both supported four-player formats", () => {
		const singles = generateSchedule(players.slice(0, 4), {
			fourPlayerFormat: "singles",
		});
		const mixed = generateSchedule(players.slice(0, 4), {
			fourPlayerFormat: "mixed",
		});

		assert.equal(singles.length, 3);
		assert.equal(singles.flatMap((round) => round.matches).length, 6);
		assert.equal(mixed.length, 6);
		assert.equal(
			mixed.flatMap((round) => round.matches).filter(
				(match) => match.type === "doubles",
			).length,
			3,
		);
	});

	it("gives every five-player pairing exactly two matches", () => {
		const rounds = generateSchedule(players.slice(0, 5));
		const pairCounts = singlesPairs(rounds).reduce<Record<string, number>>(
			(counts, pair) => ({ ...counts, [pair]: (counts[pair] ?? 0) + 1 }),
			{},
		);

		assert.equal(rounds.length, 10);
		assert.equal(Object.keys(pairCounts).length, 10);
		assert.ok(Object.values(pairCounts).every((count) => count === 2));
	});

	it("keeps six-player partners apart in the opening singles phase", () => {
		const rounds = generateSchedule(players, {
			sixPlayerRound5SinglesTeam: "B",
		});
		const openingPairs = singlesPairs(rounds.slice(0, 4));
		const roundFiveSingles = singlesPairs([rounds[4]]);

		assert.equal(rounds.length, 7);
		assert.equal(openingPairs.length, 12);
		assert.equal(new Set(openingPairs).size, 12);
		assert.ok(!openingPairs.includes("AB"));
		assert.ok(!openingPairs.includes("CD"));
		assert.ok(!openingPairs.includes("EF"));
		assert.deepEqual(roundFiveSingles, ["CD"]);
	});
});
