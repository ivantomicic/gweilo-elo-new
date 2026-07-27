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
		title: "Sesija je počela",
		body: `${playerCount} igrača je spremno. Otvori Gweilo i pogledaj prvu rundu.`,
		audience: {
			type: "session",
			sessionId,
			excludeUserIds: [createdBy],
		},
		data: {
			sessionId,
			route: "session",
		},
		dedupeKey: `session:${sessionId}:started`,
		collapseId: `session-${sessionId}`,
		createdBy,
	});
}

export function notifySessionCompleted({
	sessionId,
	createdBy,
	forceClosed = false,
	excludeUserIds = [],
}: {
	sessionId: string;
	createdBy: string;
	forceClosed?: boolean;
	excludeUserIds?: string[];
}) {
	return dispatchNotificationSafely({
		eventType: "session_completed",
		category: "results",
		title: "Sesija je završena",
		body: forceClosed
			? "Sesija je zatvorena. Otvori Gweilo i pogledaj rezultate."
			: "Sve runde su završene. Pogledaj rezultate i novi Elo.",
		audience: { type: "session", sessionId, excludeUserIds },
		data: {
			sessionId,
			route: "session",
		},
		dedupeKey: `session:${sessionId}:completed`,
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
		title: "Nova Gweilo anketa",
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
