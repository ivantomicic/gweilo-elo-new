import type { APNsLiveActivityPayload } from "../notifications/apns";
import type {
	SessionLiveActivityAttributes,
	SessionLiveActivityState,
} from "./types";

const activityAttributesType = "GweiloSessionActivityAttributes";

export function makeSessionLiveActivityStartPayload({
	attributes,
	state,
	timestamp = Math.floor(Date.now() / 1000),
}: {
	attributes: SessionLiveActivityAttributes;
	state: SessionLiveActivityState;
	timestamp?: number;
}): APNsLiveActivityPayload {
	return {
		aps: {
			timestamp,
			event: "start",
			"content-state": state,
			"attributes-type": activityAttributesType,
			attributes,
			"input-push-token": 1,
			"stale-date": timestamp + 2 * 60 * 60,
			alert: {
				title: "Sesija je počela",
				body: "Prati rundu i sledeće mečeve uživo.",
			},
		},
	};
}

export function makeSessionLiveActivityUpdatePayload({
	state,
	timestamp = Math.floor(Date.now() / 1000),
}: {
	state: SessionLiveActivityState;
	timestamp?: number;
}): APNsLiveActivityPayload {
	return {
		aps: {
			timestamp,
			event: "update",
			"content-state": state,
			"stale-date": timestamp + 2 * 60 * 60,
		},
	};
}

export function makeSessionLiveActivityEndPayload({
	state,
	timestamp = Math.floor(Date.now() / 1000),
	dismissAfterSeconds = 15 * 60,
}: {
	state: SessionLiveActivityState;
	timestamp?: number;
	dismissAfterSeconds?: number;
}): APNsLiveActivityPayload {
	return {
		aps: {
			timestamp,
			event: "end",
			"content-state": state,
			"dismissal-date": timestamp + dismissAfterSeconds,
		},
	};
}
