import assert from "node:assert/strict";
import test from "node:test";
import {
	defaultNotificationPreferences,
	filterAudienceUserIds,
	preferenceAllowsCategory,
	type NotificationPreferences,
} from "../../lib/notifications/types";

test("new users receive every notification category by default", () => {
	for (const category of [
		"sessions",
		"rounds",
		"results",
		"polls",
		"announcements",
	] as const) {
		assert.equal(
			preferenceAllowsCategory(defaultNotificationPreferences, category),
			true,
		);
	}
});

test("the master switch disables every category", () => {
	const preferences: NotificationPreferences = {
		...defaultNotificationPreferences,
		enabled: false,
	};
	assert.equal(preferenceAllowsCategory(preferences, "sessions"), false);
	assert.equal(preferenceAllowsCategory(preferences, "announcements"), false);
});

test("each category can be disabled independently", () => {
	const preferences: NotificationPreferences = {
		...defaultNotificationPreferences,
		roundsEnabled: false,
		pollsEnabled: false,
	};
	assert.equal(preferenceAllowsCategory(preferences, "sessions"), true);
	assert.equal(preferenceAllowsCategory(preferences, "rounds"), false);
	assert.equal(preferenceAllowsCategory(preferences, "results"), true);
	assert.equal(preferenceAllowsCategory(preferences, "polls"), false);
});

test("an initiating user can be excluded from a notification audience", () => {
	assert.deepEqual(
		filterAudienceUserIds(
			["session-creator", "player-two", "player-two", "player-three"],
			["session-creator"],
		),
		["player-two", "player-three"],
	);
});
