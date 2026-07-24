import { dispatchNotificationSafely } from "./service";

export function notifySessionStarted({
	sessionId,
	playerCount,
	createdBy,
}: {
	sessionId: string;
	playerCount: number;
	createdBy: string;
}) {
	return dispatchNotificationSafely({
		eventType: "session_started",
		category: "sessions",
		title: "Session started",
		body: `${playerCount} players are ready. Open Gweilo to see Round 1.`,
		audience: { type: "session", sessionId },
		data: {
			sessionId,
			route: "session",
		},
		dedupeKey: `session:${sessionId}:started`,
		collapseId: `session-${sessionId}`,
		createdBy,
	});
}

export function notifyRoundReady({
	sessionId,
	completedRound,
	nextRound,
	createdBy,
}: {
	sessionId: string;
	completedRound: number;
	nextRound: number;
	createdBy: string;
}) {
	return dispatchNotificationSafely({
		eventType: "round_ready",
		category: "rounds",
		title: `Round ${nextRound} is ready`,
		body: `Round ${completedRound} was saved. Open Gweilo for the next matches.`,
		audience: { type: "session", sessionId },
		data: {
			sessionId,
			roundNumber: nextRound,
			route: "session",
		},
		dedupeKey: `session:${sessionId}:round:${nextRound}:ready`,
		collapseId: `session-${sessionId}`,
		createdBy,
	});
}

export function notifySessionCompleted({
	sessionId,
	createdBy,
	forceClosed = false,
}: {
	sessionId: string;
	createdBy: string;
	forceClosed?: boolean;
}) {
	return dispatchNotificationSafely({
		eventType: "session_completed",
		category: "results",
		title: "Session completed",
		body: forceClosed
			? "The session was closed. Open Gweilo to review the recorded results."
			: "All rounds are complete. Your results and updated Elo are ready.",
		audience: { type: "session", sessionId },
		data: {
			sessionId,
			route: "session",
		},
		dedupeKey: `session:${sessionId}:completed`,
		collapseId: `session-${sessionId}`,
		createdBy,
	});
}

export function notifySessionCancelled({
	sessionId,
	createdBy,
	userIds,
}: {
	sessionId: string;
	createdBy: string;
	userIds: string[];
}) {
	return dispatchNotificationSafely({
		eventType: "session_cancelled",
		category: "sessions",
		title: "Session cancelled",
		body: "This session was cancelled before any results were recorded.",
		audience: { type: "users", userIds },
		data: {
			sessionId,
			route: "sessions",
		},
		dedupeKey: `session:${sessionId}:cancelled`,
		collapseId: `session-${sessionId}`,
		createdBy,
	});
}

export function notifyPollCreated({
	pollId,
	question,
	createdBy,
}: {
	pollId: string;
	question: string;
	createdBy: string;
}) {
	return dispatchNotificationSafely({
		eventType: "poll_created",
		category: "polls",
		title: "New Gweilo poll",
		body: question,
		audience: { type: "all" },
		data: {
			pollId,
			route: "polls",
		},
		dedupeKey: `poll:${pollId}:created`,
		collapseId: "polls",
		createdBy,
	});
}
