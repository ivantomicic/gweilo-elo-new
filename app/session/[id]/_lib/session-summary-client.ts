export type SessionPlayerSummary = {
	player_id: string;
	display_name: string;
	avatar: string | null;
	elo_before: number;
	elo_after: number;
	elo_change: number;
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
};

export type SessionTeamSummary = {
	team_id: string;
	player1_id: string;
	player2_id: string;
	player1_name: string;
	player2_name: string;
	player1_avatar: string | null;
	player2_avatar: string | null;
	elo_before: number;
	elo_after: number;
	elo_change: number;
	matches_played: number;
	wins: number;
	losses: number;
	draws: number;
};

export type SummaryView = "singles" | "doubles_player" | "doubles_team";

export type SessionSummaryResponse = {
	singles?: SessionPlayerSummary[];
	doubles_player?: SessionPlayerSummary[];
	doubles_team?: SessionTeamSummary[];
};

type SummaryCacheEntry = {
	data?: SessionSummaryResponse;
	promise?: Promise<SessionSummaryResponse>;
};

const summaryCache = new Map<string, SummaryCacheEntry>();

function getSummaryCacheKey(sessionId: string, view: SummaryView) {
	return `${sessionId}:${view}`;
}

async function requestSessionSummary(
	sessionId: string,
	view: SummaryView,
	accessToken: string,
) {
	const response = await fetch(`/api/sessions/${sessionId}/summary?type=${view}`, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}));
		throw new Error(errorData.error || "Failed to load session summary");
	}

	return (await response.json()) as SessionSummaryResponse;
}

export function readCachedSessionSummary(
	sessionId: string,
	view: SummaryView,
) {
	return summaryCache.get(getSummaryCacheKey(sessionId, view))?.data ?? null;
}

export async function getOrFetchSessionSummary(
	sessionId: string,
	view: SummaryView,
	getAccessToken: () => Promise<string>,
) {
	const cacheKey = getSummaryCacheKey(sessionId, view);
	const existingEntry = summaryCache.get(cacheKey);

	if (existingEntry?.data) {
		return existingEntry.data;
	}

	if (existingEntry?.promise) {
		return existingEntry.promise;
	}

	let requestPromise!: Promise<SessionSummaryResponse>;
	requestPromise = (async () => {
		const accessToken = await getAccessToken();
		const data = await requestSessionSummary(sessionId, view, accessToken);
		if (summaryCache.get(cacheKey)?.promise === requestPromise) {
			summaryCache.set(cacheKey, { data });
		}
		return data;
	})().catch((error) => {
		if (summaryCache.get(cacheKey)?.promise === requestPromise) {
			summaryCache.delete(cacheKey);
		}
		throw error;
	});

	summaryCache.set(cacheKey, { promise: requestPromise });
	return requestPromise;
}

export function prefetchSessionSummary(
	sessionId: string,
	view: SummaryView,
	accessToken: string,
) {
	return getOrFetchSessionSummary(sessionId, view, async () => accessToken);
}

export function clearSessionSummaryCache(sessionId: string) {
	const keyPrefix = `${sessionId}:`;

	for (const cacheKey of summaryCache.keys()) {
		if (cacheKey.startsWith(keyPrefix)) {
			summaryCache.delete(cacheKey);
		}
	}
}
