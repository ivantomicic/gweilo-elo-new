export type SessionHistoryPoint = {
	match: number;
	elo: number;
	date: string;
	sessionId?: string | null;
	delta?: number;
	result?: "win" | "loss" | "draw" | null;
};

export type PlayerSessionSummary = {
	key: string;
	sessionId: string | null;
	date: string;
	matchCount: number;
	wins: number;
	draws: number;
	losses: number;
	eloDelta: number;
	endingElo: number;
};

/**
 * Groups committed singles Elo history into one chronological result per
 * session. Rows without a session ID stay separate so legacy data is never
 * accidentally merged merely because two matches share a date.
 */
export function summarizePlayerSessions(
	history: readonly SessionHistoryPoint[],
): PlayerSessionSummary[] {
	const chronological = [...history]
		.filter((point) => point.match > 0)
		.sort((left, right) => left.match - right.match);
	const summaries = new Map<string, PlayerSessionSummary>();

	for (const point of chronological) {
		const key = point.sessionId
			? `session:${point.sessionId}`
			: `legacy-match:${point.match}`;
		const existing = summaries.get(key) ?? {
			key,
			sessionId: point.sessionId ?? null,
			date: point.date,
			matchCount: 0,
			wins: 0,
			draws: 0,
			losses: 0,
			eloDelta: 0,
			endingElo: point.elo,
		};

		existing.matchCount += 1;
		existing.endingElo = point.elo;
		if (point.date) existing.date = point.date;
		if (Number.isFinite(point.delta)) existing.eloDelta += point.delta ?? 0;
		if (point.result === "win") existing.wins += 1;
		if (point.result === "draw") existing.draws += 1;
		if (point.result === "loss") existing.losses += 1;

		summaries.set(key, existing);
	}

	return [...summaries.values()]
		.map((summary) => ({
			...summary,
			eloDelta: Math.round(summary.eloDelta),
		}))
		.reverse();
}

export function serbianMatchCount(count: number) {
	const lastTwo = Math.abs(count) % 100;
	const last = Math.abs(count) % 10;
	if (last === 1 && lastTwo !== 11) return `${count} meč`;
	if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
		return `${count} meča`;
	}
	return `${count} mečeva`;
}
