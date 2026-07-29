export type MatchEloHistoryDelta = {
	player1_id: string | null;
	player1_elo_delta: number | string | null;
	player2_id: string | null;
	player2_elo_delta: number | string | null;
};

export type PlayerEloTotal = {
	playerId: string;
	eloChange: number;
};

export type BestWorstEloTotals = {
	best: PlayerEloTotal | null;
	worst: PlayerEloTotal | null;
};

function comparePlayerIds(left: PlayerEloTotal, right: PlayerEloTotal) {
	return left.playerId.localeCompare(right.playerId);
}

function addDelta(
	totals: Map<string, number>,
	playerId: string | null,
	delta: number | string | null,
) {
	if (!playerId || !totals.has(playerId)) return;

	const numericDelta = Number(delta ?? 0);
	if (!Number.isFinite(numericDelta)) return;

	totals.set(playerId, (totals.get(playerId) ?? 0) + numericDelta);
}

/**
 * Aggregates the exact Elo deltas committed for a session.
 *
 * Eligible players are initialized at zero so force-closed sessions with
 * completed singles but no committed Elo history match the session summary.
 */
export function aggregateBestWorstEloTotals(
	eligiblePlayerIds: Iterable<string>,
	history: MatchEloHistoryDelta[],
): BestWorstEloTotals {
	const totals = new Map<string, number>();
	for (const playerId of eligiblePlayerIds) {
		totals.set(playerId, 0);
	}

	for (const row of history) {
		addDelta(totals, row.player1_id, row.player1_elo_delta);
		addDelta(totals, row.player2_id, row.player2_elo_delta);
	}

	const players = Array.from(totals, ([playerId, eloChange]) => ({
		playerId,
		eloChange,
	}));

	if (players.length === 0) {
		return { best: null, worst: null };
	}

	const best = [...players].sort((left, right) => {
		if (left.eloChange !== right.eloChange) {
			return right.eloChange - left.eloChange;
		}
		return comparePlayerIds(left, right);
	})[0];

	const worst = [...players].sort((left, right) => {
		if (left.eloChange !== right.eloChange) {
			return left.eloChange - right.eloChange;
		}
		return comparePlayerIds(left, right);
	})[0];

	return { best, worst };
}
