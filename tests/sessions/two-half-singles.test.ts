import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateSchedule, type SessionPlayer } from "../../lib/sessions/schedule";
import {
	combineTwoHalfSinglesScore,
	countsAsFinalSinglesResult,
	detectTwoHalfSinglesSession,
	findPairedMatch,
	getEffectiveTwoHalfSinglesScore,
} from "../../lib/sessions/two-half-singles";

const players: SessionPlayer[] = Array.from({ length: 6 }, (_, index) => ({
	id: String.fromCharCode(65 + index),
	name: String.fromCharCode(65 + index),
	avatar: null,
}));

const recordsFor = (
	playerCount: 4 | 5 | 6,
	format?: "singles" | "mixed",
) =>
	generateSchedule(players.slice(0, playerCount), {
		fourPlayerFormat: playerCount === 4 ? format : undefined,
		sixPlayerFormat: playerCount === 6 ? format : undefined,
	}).flatMap((round) =>
		round.matches.map((match, matchOrder) => ({
			id: `${round.roundNumber}-${matchOrder}`,
			round_number: round.roundNumber,
			match_order: matchOrder,
			match_type: match.type,
			player_ids: match.players.map((player) => player.id),
			team1_score: round.roundNumber <= (playerCount === 4 ? 3 : 5) ? 3 : 1,
			team2_score: round.roundNumber <= (playerCount === 4 ? 3 : 5) ? 1 : 3,
		})),
	);

describe("two-half singles sessions", () => {
	it("recognizes four-, five-, and six-player aggregate schedules", () => {
		assert.deepEqual(detectTwoHalfSinglesSession(4, recordsFor(4, "singles")), {
			halfRoundCount: 3,
			matchesPerRound: 2,
		});
		assert.deepEqual(detectTwoHalfSinglesSession(5, recordsFor(5)), {
			halfRoundCount: 5,
			matchesPerRound: 2,
		});
		assert.deepEqual(detectTwoHalfSinglesSession(6, recordsFor(6, "singles")), {
			halfRoundCount: 5,
			matchesPerRound: 3,
		});
	});

	it("does not mistake mixed four- or six-player schedules for two halves", () => {
		assert.equal(detectTwoHalfSinglesSession(4, recordsFor(4, "mixed")), null);
		assert.equal(detectTwoHalfSinglesSession(6, recordsFor(6, "mixed")), null);
	});

	it("finds the paired fixture and combines its score once", () => {
		const matches = recordsFor(4, "singles");
		const config = detectTwoHalfSinglesSession(4, matches)!;
		const secondHalfMatch = matches.find(
			(match) => match.round_number === 4 && match.match_order === 0,
		)!;
		const firstHalfMatch = findPairedMatch(secondHalfMatch, matches, config);

		assert.equal(firstHalfMatch?.round_number, 1);
		assert.deepEqual(
			combineTwoHalfSinglesScore(firstHalfMatch!, secondHalfMatch, {
				team1Score: 1,
				team2Score: 3,
			}),
			{ team1Score: 4, team2Score: 4 },
		);
		assert.deepEqual(
			getEffectiveTwoHalfSinglesScore(secondHalfMatch, matches, config),
			{ team1Score: 4, team2Score: 4 },
		);
	});

	it("counts only settled fixtures in a two-half session", () => {
		const matches = recordsFor(6, "singles");
		const config = detectTwoHalfSinglesSession(6, matches)!;
		const countedMatches = matches.filter((match) =>
			countsAsFinalSinglesResult(match, config),
		);

		assert.equal(matches.length, 30);
		assert.equal(countedMatches.length, 15);
		assert.ok(
			countedMatches.every(
				(match) => match.round_number > config.halfRoundCount,
			),
		);
	});

	it("recalculates the aggregate when either saved half is edited", () => {
		const matches = recordsFor(4, "singles");
		const config = detectTwoHalfSinglesSession(4, matches)!;
		const secondHalfMatch = matches.find(
			(match) => match.round_number === 4 && match.match_order === 0,
		)!;
		const firstHalfMatch = findPairedMatch(secondHalfMatch, matches, config)!;
		const editedSecondHalf = { team1Score: 3, team2Score: 0 };
		const secondHalfOverrides = new Map([
			[secondHalfMatch.id, editedSecondHalf],
		]);

		assert.deepEqual(
			getEffectiveTwoHalfSinglesScore(
				secondHalfMatch,
				matches,
				config,
				secondHalfOverrides,
			),
			combineTwoHalfSinglesScore(
				firstHalfMatch,
				secondHalfMatch,
				editedSecondHalf,
			),
		);

		const editedFirstHalf = { team1Score: 0, team2Score: 3 };
		const firstHalfOverrides = new Map([
			[firstHalfMatch.id, editedFirstHalf],
		]);
		assert.deepEqual(
			getEffectiveTwoHalfSinglesScore(
				secondHalfMatch,
				matches,
				config,
				firstHalfOverrides,
			),
			combineTwoHalfSinglesScore(
				{
					...firstHalfMatch,
					team1_score: editedFirstHalf.team1Score,
					team2_score: editedFirstHalf.team2Score,
				},
				secondHalfMatch,
				{
					team1Score: secondHalfMatch.team1_score,
					team2Score: secondHalfMatch.team2_score,
				},
			),
		);
	});

	it("keeps the edited aggregate aligned when the second-half order is reversed", () => {
		const matches = recordsFor(4, "singles");
		const secondHalfIndex = matches.findIndex(
			(match) => match.round_number === 4 && match.match_order === 0,
		);
		const reversedSecondHalf = {
			...matches[secondHalfIndex],
			player_ids: [...matches[secondHalfIndex].player_ids].reverse(),
		};
		matches[secondHalfIndex] = reversedSecondHalf;
		const config = detectTwoHalfSinglesSession(4, matches)!;
		const overrides = new Map([
			[reversedSecondHalf.id, { team1Score: 2, team2Score: 0 }],
		]);

		assert.deepEqual(
			getEffectiveTwoHalfSinglesScore(
				reversedSecondHalf,
				matches,
				config,
				overrides,
			),
			{ team1Score: 3, team2Score: 3 },
		);
	});
});
