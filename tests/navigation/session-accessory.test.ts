import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canStartSession, getUserRoleFromAuthUser } from "../../lib/auth/roles";
import { getSessionAccessory } from "../../lib/navigation/session-accessory";

const base = {
	isAuthenticated: true,
	role: "user",
	loading: false,
	pathname: "/",
	activeSession: null,
};

test("only explicit moderator and admin roles can create sessions", () => {
	for (const role of ["mod", "admin"]) {
		assert.equal(canStartSession(role), true);
		assert.equal(getSessionAccessory({ ...base, role })?.href, "/start-session");
	}
	for (const role of ["user", "guest", "moderator", "ADMIN", "", null, undefined]) {
		assert.equal(canStartSession(role), false);
		assert.equal(getSessionAccessory({ ...base, role }), null);
	}
});

test("creation never flashes while auth or active-session state is loading", () => {
	for (const isAuthenticated of [null, false]) {
		assert.equal(getSessionAccessory({ ...base, role: "admin", isAuthenticated }), null);
	}
	assert.equal(getSessionAccessory({ ...base, role: "admin", loading: true }), null);
});

test("every page uses the same creation allowlist and excludes the creation flow", () => {
	for (const pathname of ["/", "/sessions", "/statistics", "/player/one", "/calculator"]) {
		assert.equal(getSessionAccessory({ ...base, pathname }), null);
		assert.equal(getSessionAccessory({ ...base, pathname, role: "mod" })?.href, "/start-session");
	}
	for (const pathname of ["/start-session", "/start-session/players", "/start-session/schedule", "/oauth/authorize"]) {
		assert.equal(getSessionAccessory({ ...base, pathname, role: "admin" }), null);
	}
});

test("players can view an active session without receiving a creation link", () => {
	const activeSession = { id: "live", current_round: 2, total_rounds: 5 };
	const accessory = getSessionAccessory({ ...base, activeSession });
	assert.equal(accessory?.href, "/session/live");
	assert.match(accessory?.label ?? "", /Termin u toku · Runda 2 od 5/);
	assert.equal(getSessionAccessory({ ...base, activeSession, pathname: "/session/live" }), null);
	assert.equal(getSessionAccessory(base), null);
});

test("creation roles cannot be granted by editable user metadata", () => {
	const user = { app_metadata: { role: "user" }, user_metadata: { role: "admin" } };
	assert.equal(canStartSession(getUserRoleFromAuthUser(user)), false);
	assert.equal(canStartSession(getUserRoleFromAuthUser({ app_metadata: { role: "mod" } })), true);
});

test("production navigation, creation guard and verified API share the allowlist", () => {
	assert.match(readFileSync("components/mobile-nav.tsx", "utf8"), /getSessionAccessory\(/);
	const guard = readFileSync("components/auth/session-creation-guard.tsx", "utf8");
	assert.match(guard, /if \(!session \|\| !canStartSession\(role\) \|\| isChecking\)/);
	const api = readFileSync("app/api/sessions/route.ts", "utf8");
	assert.ok(api.indexOf("await verifyUser(") < api.indexOf("!canStartSession(auth.role)"));
	assert.match(api, /if \(!canStartSession\(auth.role\)\)[\s\S]*?status: 403/);
});
