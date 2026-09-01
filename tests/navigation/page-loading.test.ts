import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("PageLoading delegates to the accessible native loader without overlay positioning", () => {
	const source = readFileSync("components/ui/loading.tsx", "utf8");
	const preset = source.slice(source.indexOf("export function PageLoading"), source.indexOf("export function FullScreenLoading"));
	assert.match(preset, /<Loading/);
	assert.match(preset, /size="xl"/);
	assert.match(preset, /min-h-\[60svh\] py-10/);
	assert.doesNotMatch(preset, /className=.*(?:fixed|absolute)|inset-0|z-40|bg-background/);
	assert.match(source, /role = "status"/);
	assert.match(source, /aria-busy="true"/);
	assert.match(source, /motion-reduce:hidden/);
});

test("normal data loading never mounts the full-screen overlay", () => {
	for (const path of [
		"app/calculator/page.tsx", "app/player/[id]/page.tsx", "app/team/[id]/page.tsx",
		"app/sessions/page.tsx", "app/session/[id]/page.tsx", "app/videos/page.tsx",
		"components/home/home-native.tsx", "components/admin/user-management-table.tsx", "app/admin/activity-log/page.tsx",
	]) {
		const source = readFileSync(path, "utf8");
		assert.match(source, /<PageLoading/, path);
		assert.doesNotMatch(source, /FullScreenLoading/, path);
	}
});

test("early-return session loaders retain the real navigation shell", () => {
	assert.match(readFileSync("app/sessions/page.tsx", "utf8"), /if \(loading\) \{\s*return \(\s*<SessionsLayout>\s*<PageLoading/);
	assert.match(readFileSync("app/session/[id]/page.tsx", "utf8"), /if \(loading\) \{\s*return \(\s*<AppShell[^>]*>\s*<PageLoading/);
});

test("calculator loader stays inside its headerless shell and shared container", () => {
	const source = readFileSync("app/calculator/page.tsx", "utf8");
	assert.match(source, /<AppShell\s[^>]*showHeader=\{false\}/);
	assert.ok(source.indexOf("<PageLoading") > source.indexOf("<PageContainer"));
	assert.ok(source.indexOf("<PageLoading") < source.indexOf("</PageContainer>"));
});
