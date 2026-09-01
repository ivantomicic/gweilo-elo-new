import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("native hero pages disable the redundant title bar at every breakpoint", () => {
	for (const file of ["app/page.tsx", "app/statistics/page.tsx", "app/sessions/_components/sessions-layout.tsx", "app/calculator/page.tsx"]) {
		const source = readFileSync(file, "utf8");
		assert.match(source, /<AppShell\s[^>]*showHeader=\{false\}/, file);
		assert.doesNotMatch(source, /data-site-header/, file);
	}
});

test("removing the title bar retains desktop sidebar open and close controls", () => {
	const shell = readFileSync("components/app-shell.tsx", "utf8");
	const sidebar = readFileSync("components/app-sidebar.tsx", "utf8");
	assert.match(shell, /showToggle=\{!showHeader\}/);
	assert.match(shell, /!showHeader && <HeaderlessSidebarToggle/);
	assert.match(shell, /if \(open\) return null/);
	assert.match(shell, /aria-label="Otvori navigaciju"/);
	assert.match(sidebar, /showToggle && <SidebarTrigger aria-label="Zatvori navigaciju"/);
});
