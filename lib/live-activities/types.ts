import type { APNsEnvironment } from "../notifications/apns";

export type SessionLiveActivityStatus =
	| "active"
	| "completed"
	| "cancelled";

export type SessionLiveActivityMatchup = {
	left: string;
	right: string;
	kind: "SINGL" | "DUBL";
};

export type SessionLiveActivityState = {
	currentRound: number;
	totalRounds: number;
	completedMatches: number;
	totalMatches: number;
	status: SessionLiveActivityStatus;
	headline: string;
	matchups: SessionLiveActivityMatchup[];
	playerNames: string[];
	nextMatchups: SessionLiveActivityMatchup[];
	latestResult: string | null;
	bestPlayerName: string | null;
	bestPlayerDelta: number | null;
	worstPlayerName: string | null;
	worstPlayerDelta: number | null;
};

export type SessionLiveActivityAttributes = {
	sessionID: string;
	playerCount: number;
};

export type LiveActivityTokenRecord = {
	id: string;
	user_id: string;
	token: string;
	token_type: "push_to_start" | "update";
	activity_id: string | null;
	session_id: string | null;
	environment: APNsEnvironment;
	bundle_id: string;
	device_identifier: string;
};

export type LiveActivityEvent = "start" | "update" | "end";
