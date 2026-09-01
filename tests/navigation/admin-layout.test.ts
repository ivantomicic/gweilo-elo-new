import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { getAdminAccessState } from "../../lib/auth/admin-access";
import {
	adminNavigationItems,
	getActiveAdminNavigationValue,
} from "../../components/admin/admin-navigation";

test("admin access fails closed without an authenticated admin role", () => {
	assert.equal(getAdminAccessState(null, null), "loading");
	assert.equal(getAdminAccessState(false, "admin"), "signed-out");
	for (const role of [null, "user", "mod"] as const) {
		assert.equal(getAdminAccessState(true, role), "denied");
	}
	assert.equal(getAdminAccessState(true, "admin"), "allowed");
});

test("admin UI reuses verified root auth without another mount-time role fetch", () => {
	const guard = readFileSync("components/auth/admin-guard.tsx", "utf8");
	assert.match(guard, /useAuth\(\)/);
	assert.match(guard, /getAdminAccessState\(isAuthenticated, role\)/);
	assert.doesNotMatch(guard, /getUserRole|useState|fetch\(/);
	const auth = readFileSync("lib/auth/useAuth.ts", "utf8");
	assert.match(auth, /supabase\.auth\.getUser\(nextSession\.access_token\)/);
	assert.match(readFileSync("app/api/admin/users/route.ts", "utf8"), /await verifyModOrAdmin\(/);
	for (const path of ["app/api/admin/users/[userId]/route.ts", "app/api/admin/missions/route.ts", "app/api/admin/name-cases/route.ts"]) {
		assert.match(readFileSync(path, "utf8"), /await verifyAdmin\(/, path);
	}
});

test("one persistent headerless layout guards all remaining admin pages", () => {
	const layout = readFileSync("app/admin/layout.tsx", "utf8");
	assert.match(layout, /<AdminGuard>\s*<AppShell[^>]*showHeader=\{false\}/);
	assert.match(layout, /<PageContainer/);
	for (const item of adminNavigationItems) {
		const page = readFileSync(`app${item.url}/page.tsx`, "utf8");
		assert.doesNotMatch(page, /<AppShell|<AdminGuard|<AdminTabs|<FullScreenLoading/, item.url);
	}
});

test("canonical admin links select correctly and old bookmarks redirect", () => {
	assert.deepEqual(adminNavigationItems.map((item) => item.url), [
		"/admin/users", "/admin/activity-log", "/admin/missions", "/admin/name-cases", "/admin/design-system",
	]);
	for (const item of adminNavigationItems) {
		assert.equal(getActiveAdminNavigationValue(item.url), item.value);
		assert.equal(getActiveAdminNavigationValue(`${item.url}/detail`), item.value);
	}
	assert.equal(getActiveAdminNavigationValue("/admin/activity"), "activity");
	assert.match(readFileSync("app/admin/page.tsx", "utf8"), /redirect\("\/admin\/users"\)/);
	assert.match(readFileSync("app/admin/activity/page.tsx", "utf8"), /redirect\("\/admin\/activity-log"\)/);
	assert.match(readFileSync("components/mobile-nav.tsx", "utf8"), /url: "\/admin\/users"/);
});

test("legacy admin paths redirect before rendering the client access gate", async () => {
	const config = require(`${process.cwd()}/next.config.js`);
	assert.deepEqual(await config.redirects(), [
		{ source: "/admin", destination: "/admin/users", permanent: false },
		{ source: "/admin/activity", destination: "/admin/activity-log", permanent: false },
	]);
});

test("retired admin features are removed, not merely hidden", () => {
	for (const path of [
		"app/admin/form-audit/page.tsx", "app/api/admin/form-audit/route.ts", "components/admin/form-audit-panel.tsx",
		"app/admin/notifications/page.tsx", "app/api/admin/notifications/send/route.ts", "components/admin/notification-composer.tsx",
		"app/admin/settings/page.tsx", "app/api/maintenance/route.ts", "components/admin/maintenance-settings.tsx", "components/maintenance/maintenance-guard.tsx",
	]) assert.equal(existsSync(path), false, path);
	assert.doesNotMatch(readFileSync("app/layout.tsx", "utf8"), /MaintenanceGuard|api\/maintenance/);
	// Shared native delivery and personal profile editing are separate features.
	assert.ok(existsSync("app/settings/page.tsx"));
	assert.ok(existsSync("lib/notifications/apns.ts"));
	assert.ok(existsSync("lib/live-activities/service.ts"));
});
