import assert from "node:assert/strict";
import test from "node:test";
import { isAPNsConfigured } from "../../lib/notifications/apns";

const managedVariables = [
	"APNS_TEAM_ID",
	"APNS_BUNDLE_ID",
	"APNS_KEY_ID",
	"APNS_PRIVATE_KEY_BASE64",
	"APNS_DEVELOPMENT_KEY_ID",
	"APNS_DEVELOPMENT_PRIVATE_KEY_BASE64",
	"APNS_PRODUCTION_KEY_ID",
	"APNS_PRODUCTION_PRIVATE_KEY_BASE64",
] as const;

function withoutAPNsEnvironment(run: () => void) {
	const previous = new Map(
		managedVariables.map((name) => [name, process.env[name]]),
	);
	for (const name of managedVariables) delete process.env[name];
	try {
		run();
	} finally {
		for (const name of managedVariables) {
			const value = previous.get(name);
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	}
}

test("supports separate Sandbox and Production APNs credentials", () => {
	withoutAPNsEnvironment(() => {
		process.env.APNS_TEAM_ID = "TEAM123456";
		process.env.APNS_DEVELOPMENT_KEY_ID = "DEV1234567";
		process.env.APNS_DEVELOPMENT_PRIVATE_KEY_BASE64 =
			Buffer.from("development-key").toString("base64");

		assert.equal(isAPNsConfigured("development"), true);
		assert.equal(isAPNsConfigured("production"), false);

		process.env.APNS_PRODUCTION_KEY_ID = "PROD123456";
		process.env.APNS_PRODUCTION_PRIVATE_KEY_BASE64 =
			Buffer.from("production-key").toString("base64");
		assert.equal(isAPNsConfigured("production"), true);
	});
});

test("keeps legacy keys as a shared fallback", () => {
	withoutAPNsEnvironment(() => {
		process.env.APNS_TEAM_ID = "TEAM123456";
		process.env.APNS_KEY_ID = "KEY1234567";
		process.env.APNS_PRIVATE_KEY_BASE64 =
			Buffer.from("shared-key").toString("base64");

		assert.equal(isAPNsConfigured("development"), true);
		assert.equal(isAPNsConfigured("production"), true);
	});
});
