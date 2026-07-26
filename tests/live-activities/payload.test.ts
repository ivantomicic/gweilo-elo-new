import assert from "node:assert/strict";
import test from "node:test";
import {
	makeSessionLiveActivityEndPayload,
	makeSessionLiveActivityStartPayload,
	makeSessionLiveActivityUpdatePayload,
} from "../../lib/live-activities/payload";
import type {
	SessionLiveActivityAttributes,
	SessionLiveActivityState,
} from "../../lib/live-activities/types";

const attributes: SessionLiveActivityAttributes = {
	sessionID: "d8ac7c11-fca8-4e1a-a559-6301a57d01f3",
	playerCount: 4,
};

const state: SessionLiveActivityState = {
	currentRound: 2,
	totalRounds: 3,
	completedMatches: 2,
	totalMatches: 6,
	status: "active",
	headline: "Runda 2 je spremna",
	matchups: [
		{
			left: "Ivan",
			right: "Leo",
			kind: "SINGL",
		},
	],
	latestResult: "Ivan 3–1 Gara",
};

test("start payload contains matching ActivityKit attributes and state", () => {
	const payload = makeSessionLiveActivityStartPayload({
		attributes,
		state,
		timestamp: 1_000,
	});

	assert.deepEqual(payload.aps["content-state"], state);
	assert.deepEqual(payload.aps.attributes, attributes);
	assert.equal(payload.aps.event, "start");
	assert.equal(
		payload.aps["attributes-type"],
		"GweiloSessionActivityAttributes",
	);
	assert.equal(payload.aps["input-push-token"], 1);
	assert.equal(payload.aps["stale-date"], 8_200);
	assert.deepEqual(payload.aps.alert, {
		title: "Sesija je počela",
		body: "Prati rundu i sledeće mečeve uživo.",
	});
});

test("update payload carries a fresh content state", () => {
	const payload = makeSessionLiveActivityUpdatePayload({
		state: {
			...state,
			currentRound: 3,
			completedMatches: 4,
		},
		timestamp: 2_000,
	});

	assert.equal(payload.aps.event, "update");
	assert.equal(payload.aps["content-state"].currentRound, 3);
	assert.equal(payload.aps["content-state"].completedMatches, 4);
	assert.equal(payload.aps["stale-date"], 9_200);
});

test("end payload dismisses after the requested grace period", () => {
	const payload = makeSessionLiveActivityEndPayload({
		state: {
			...state,
			status: "completed",
			headline: "Sesija je završena",
		},
		timestamp: 3_000,
		dismissAfterSeconds: 120,
	});

	assert.equal(payload.aps.event, "end");
	assert.equal(payload.aps["content-state"].status, "completed");
	assert.equal(payload.aps["dismissal-date"], 3_120);
});
