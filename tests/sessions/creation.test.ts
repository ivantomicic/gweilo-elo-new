import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildAtomicSessionPayload,
	isValidIdempotencyKey,
	validateSessionCreation,
	type SessionCreationPlayer,
} from "../../lib/sessions/creation";
import { generateSchedule } from "../../lib/sessions/schedule";

const players: SessionCreationPlayer[] = Array.from(
	{ length: 6 },
	(_, index) => ({
		id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
		name: `Player ${index + 1}`,
		avatar: null,
	}),
);

describe("session creation boundary", () => {
	it("requires a UUID idempotency key", () => {
		assert.equal(
			isValidIdempotencyKey("10000000-0000-4000-8000-000000000001"),
			true,
		);
		assert.equal(isValidIdempotencyKey(null), false);
		assert.equal(isValidIdempotencyKey("retry-me"), false);
	});

	it("accepts a generated schedule and rejects malformed client schedules", () => {
		const rounds = generateSchedule(players.slice(0, 4), {
			fourPlayerFormat: "mixed",
		});

		assert.equal(
			validateSessionCreation({
				players: players.slice(0, 4),
				rounds,
				playerCount: 4,
			}),
			null,
		);
		assert.equal(
			validateSessionCreation({
				players: [players[0], players[0]],
				rounds: generateSchedule(players.slice(0, 2)),
				playerCount: 2,
			}),
			"Each selected player must have a unique valid ID",
		);
		assert.equal(
			validateSessionCreation({
				players: [
					{
						...players[0],
						id: "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF",
					},
					{
						...players[1],
						id: "abcdefab-cdef-4abc-8def-abcdefabcdef",
					},
				],
				rounds: generateSchedule(players.slice(0, 2)),
				playerCount: 2,
			}),
			"Each selected player must have a unique valid ID",
		);
		assert.equal(
			validateSessionCreation({
				players: players.slice(0, 2),
				rounds: [
					{
						id: "1",
						roundNumber: 1,
						matches: [
							{
								type: "singles",
								players: [players[0], players[2]],
							},
						],
					},
				],
				playerCount: 2,
			}),
			"Schedule contains an invalid match",
		);
	});

	it("builds the atomic rows, assigns six-player teams, and caches doubles pairs", async () => {
		const rounds = generateSchedule(players, {
			sixPlayerRound5SinglesTeam: "A",
		});
		const resolvedPairs: string[] = [];
		const payload = await buildAtomicSessionPayload({
			players,
			rounds,
			resolveTeam: async (left, right) => {
				const pair = `${left}:${right}`;
				resolvedPairs.push(pair);
				return `team-${resolvedPairs.length}`;
			},
		});

		assert.deepEqual(
			payload.players.map((player) => player.team),
			["A", "A", "B", "B", "C", "C"],
		);
		assert.equal(
			payload.matches.length,
			rounds.flatMap((round) => round.matches).length,
		);
		assert.equal(new Set(resolvedPairs).size, resolvedPairs.length);
		assert.ok(
			payload.matches
				.filter((match) => match.matchType === "doubles")
				.every((match) => match.team1Id && match.team2Id),
		);
	});

	it("normalizes UUID casing before persisting session players and matches", async () => {
		const uppercasedPlayers = players.slice(0, 2).map((player, index) => ({
			...player,
			id:
				index === 0
					? "ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF"
					: "FEDCBAFE-DCBA-4FED-8CBA-FEDCBAFEDCBA",
		}));
		const payload = await buildAtomicSessionPayload({
			players: uppercasedPlayers,
			rounds: generateSchedule(uppercasedPlayers),
			resolveTeam: async () => {
				throw new Error("A two-player session should not resolve teams");
			},
		});

		assert.deepEqual(
			payload.players.map((player) => player.id),
			uppercasedPlayers.map((player) => player.id.toLowerCase()),
		);
		assert.deepEqual(
			payload.matches[0].playerIds,
			uppercasedPlayers.map((player) => player.id.toLowerCase()),
		);
	});

	it("does not assign doubles teams to a six-player singles session", async () => {
		const rounds = generateSchedule(players, {
			sixPlayerFormat: "singles",
		});
		const payload = await buildAtomicSessionPayload({
			players,
			rounds,
			resolveTeam: async () => {
				throw new Error("A singles session should not resolve doubles teams");
			},
		});

		assert.deepEqual(
			payload.players.map((player) => player.team),
			[null, null, null, null, null, null],
		);
		assert.ok(payload.matches.every((match) => match.matchType === "singles"));
	});
});
