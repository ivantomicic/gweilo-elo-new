import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("session restoration never deletes persisted Supabase credentials", () => {
	const source = readFileSync("lib/supabase/client.ts", "utf8");

	assert.doesNotMatch(source, /clearPersistedSupabaseAuthState/);
	assert.doesNotMatch(source, /SESSION_TIMEOUT_MS|Promise\.race/);
});

test("background active-session checks cannot sign the user out", () => {
	for (const file of [
		"lib/client/use-active-session.ts",
		"components/auth/session-creation-guard.tsx",
	]) {
		const source = readFileSync(file, "utf8");
		assert.doesNotMatch(source, /auth\.signOut/, file);
		assert.match(source, /authenticatedFetch/, file);
	}
});

test("the root layout owns exactly one active-session poller", () => {
	const layout = readFileSync("app/layout.tsx", "utf8");
	const providers = layout.match(/<ActiveSessionProvider>/g) ?? [];

	assert.equal(providers.length, 1);
	assert.match(
		layout,
		/<ActiveSessionProvider>[\s\S]*\{children\}[\s\S]*<MobileNav\s*\/>[\s\S]*<\/ActiveSessionProvider>/,
	);
});
