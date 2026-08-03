import {
	calculateDoublesPlayerDeltas,
	calculateEloDelta,
	type MatchResult,
} from "./calculation";

export type AtomicMatch = {
	id: string;
	match_type: "singles" | "doubles";
	player_ids: string[];
	team_1_id: string | null;
	team_2_id: string | null;
	match_order: number;
	is_rated?: boolean;
};

export type AtomicScore = { team1Score: number; team2Score: number };

type RatingKind = "player_singles" | "player_doubles" | "double_team";
type RatingState = {
	elo: number;
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
	sets_won: number;
	sets_lost: number;
};

type RatingSeed = RatingState & { exists: boolean };

export type RatingInput = {
	kind: RatingKind;
	entityId: string;
	state: RatingSeed;
};

export type AtomicRoundPlan = {
	matches: Array<{
		match_id: string;
		team1_score: number;
		team2_score: number;
	}>;
	ratings: Array<{
		kind: RatingKind;
		entity_id: string;
		expected_exists: boolean;
		expected_elo: number;
		expected_matches_played: number;
		after: RatingState;
	}>;
	history: Array<Record<string, string | number | null>>;
	snapshots: Array<RatingState & { match_id: string; player_id: string }>;
};

const cloneState = (state: RatingState): RatingState => ({ ...state });
const stateKey = (kind: RatingKind, entityId: string) => `${kind}:${entityId}`;
const roundElo = (elo: number) => Math.round((elo + Number.EPSILON) * 100) / 100;

function resultFor(score: number, opponentScore: number): MatchResult {
	return score > opponentScore ? "win" : score < opponentScore ? "loss" : "draw";
}

function applyResult(
	state: RatingState,
	delta: number,
	result: MatchResult,
	setsWon: number,
	setsLost: number,
) {
	// Live rating columns are NUMERIC(10,2), so the legacy flow rounded after
	// every match before calculating the next one in the round.
	state.elo = roundElo(state.elo + delta);
	state.matches_played += 1;
	state.wins += result === "win" ? 1 : 0;
	state.losses += result === "loss" ? 1 : 0;
	state.draws += result === "draw" ? 1 : 0;
	state.sets_won += setsWon;
	state.sets_lost += setsLost;
}

/**
 * Builds the complete mutation batch in match order. The database RPC verifies
 * every expected starting rating before applying this plan in one transaction.
 */
export function buildAtomicRoundPlan({
	matches,
	displayScores,
	eloScores = displayScores,
	applyRatings = true,
	ratingInputs,
}: {
	matches: AtomicMatch[];
	displayScores: Map<string, AtomicScore>;
	eloScores?: Map<string, AtomicScore>;
	applyRatings?: boolean;
	ratingInputs: RatingInput[];
}): AtomicRoundPlan {
	const initial = new Map<string, RatingSeed>();
	const current = new Map<string, RatingState>();
	for (const input of ratingInputs) {
		const key = stateKey(input.kind, input.entityId);
		initial.set(key, { ...input.state });
		current.set(key, cloneState(input.state));
	}

	const getState = (kind: RatingKind, entityId: string) => {
		const state = current.get(stateKey(kind, entityId));
		if (!state) throw new Error(`Missing ${kind} rating seed for ${entityId}`);
		return state;
	};

	const plan: AtomicRoundPlan = { matches: [], ratings: [], history: [], snapshots: [] };
	for (const match of [...matches].sort((a, b) => a.match_order - b.match_order)) {
		const display = displayScores.get(match.id);
		if (!display) throw new Error(`Missing display score for match ${match.id}`);
		plan.matches.push({
			match_id: match.id,
			team1_score: display.team1Score,
			team2_score: display.team2Score,
		});
		if (!applyRatings || match.is_rated === false) continue;

		const score = eloScores.get(match.id);
		if (!score) throw new Error(`Missing ELO score for match ${match.id}`);
		const team1Result = resultFor(score.team1Score, score.team2Score);
		const team2Result = resultFor(score.team2Score, score.team1Score);

		if (match.match_type === "singles") {
			if (match.player_ids.length !== 2) throw new Error("Singles match must have two players");
			const [player1Id, player2Id] = match.player_ids;
			const player1 = getState("player_singles", player1Id);
			const player2 = getState("player_singles", player2Id);
			const player1Before = player1.elo;
			const player2Before = player2.elo;
			const player1CalculatedDelta = calculateEloDelta(player1.elo, player2.elo, team1Result, player1.matches_played);
			const player2CalculatedDelta = calculateEloDelta(player2.elo, player1.elo, team2Result, player2.matches_played);
			applyResult(player1, player1CalculatedDelta, team1Result, score.team1Score, score.team2Score);
			applyResult(player2, player2CalculatedDelta, team2Result, score.team2Score, score.team1Score);
			const player1Delta = roundElo(player1.elo - player1Before);
			const player2Delta = roundElo(player2.elo - player2Before);
			plan.history.push({
				match_id: match.id,
				player1_id: player1Id,
				player2_id: player2Id,
				player1_elo_before: player1Before,
				player1_elo_after: player1.elo,
				player1_elo_delta: player1Delta,
				player2_elo_before: player2Before,
				player2_elo_after: player2.elo,
				player2_elo_delta: player2Delta,
			});
			for (const playerId of match.player_ids) {
				plan.snapshots.push({ match_id: match.id, player_id: playerId, ...cloneState(getState("player_singles", playerId)) });
			}
			continue;
		}

		if (match.player_ids.length !== 4 || !match.team_1_id || !match.team_2_id) {
			throw new Error("Doubles match must have four players and two team IDs");
		}
		const team1 = getState("double_team", match.team_1_id);
		const team2 = getState("double_team", match.team_2_id);
		const team1Before = team1.elo;
		const team2Before = team2.elo;
		const team1CalculatedDelta = calculateEloDelta(team1.elo, team2.elo, team1Result, team1.matches_played);
		const team2CalculatedDelta = calculateEloDelta(team2.elo, team1.elo, team2Result, team2.matches_played);
		const players = match.player_ids.map((id) => getState("player_doubles", id));
		const playerDeltas = calculateDoublesPlayerDeltas(
			[{ elo: players[0].elo, matchCount: players[0].matches_played }, { elo: players[1].elo, matchCount: players[1].matches_played }],
			[{ elo: players[2].elo, matchCount: players[2].matches_played }, { elo: players[3].elo, matchCount: players[3].matches_played }],
			team1Result,
		);
		applyResult(team1, team1CalculatedDelta, team1Result, score.team1Score, score.team2Score);
		applyResult(team2, team2CalculatedDelta, team2Result, score.team2Score, score.team1Score);
		const team1Delta = roundElo(team1.elo - team1Before);
		const team2Delta = roundElo(team2.elo - team2Before);
		players.forEach((player, index) => applyResult(
			player,
			index < 2 ? playerDeltas.team1Delta : playerDeltas.team2Delta,
			index < 2 ? team1Result : team2Result,
			index < 2 ? score.team1Score : score.team2Score,
			index < 2 ? score.team2Score : score.team1Score,
		));
		plan.history.push({
			match_id: match.id,
			team1_id: match.team_1_id,
			team2_id: match.team_2_id,
			team1_elo_before: team1Before,
			team1_elo_after: team1.elo,
			team1_elo_delta: team1Delta,
			team2_elo_before: team2Before,
			team2_elo_after: team2.elo,
			team2_elo_delta: team2Delta,
		});
		match.player_ids.forEach((playerId, index) => {
			plan.snapshots.push({ match_id: match.id, player_id: playerId, ...cloneState(players[index]) });
		});
	}

	for (const [key, after] of current) {
		const before = initial.get(key)!;
		if (after.matches_played === before.matches_played) continue;
		const separator = key.indexOf(":");
		plan.ratings.push({
			kind: key.slice(0, separator) as RatingKind,
			entity_id: key.slice(separator + 1),
			expected_exists: before.exists,
			expected_elo: before.elo,
			expected_matches_played: before.matches_played,
			after: cloneState(after),
		});
	}
	return plan;
}
