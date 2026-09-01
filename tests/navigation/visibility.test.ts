import assert from "node:assert/strict";
import test from "node:test";
import { isNavigationItemVisible } from "../../lib/navigation/visibility";

test("temporarily hides the four paused web sections", () => {
	for (const url of ["/no-shows", "/polls", "/videos", "/rules"]) {
		assert.equal(isNavigationItemVisible({ url }), false);
	}
});

test("keeps core navigation and account/admin destinations in order", () => {
	const urls = ["/", "/statistics", "/sessions", "/calculator", "/settings", "/admin"];
	const items = urls.map((url) => ({ url }));
	assert.deepEqual(items.filter(isNavigationItemVisible), items);
});
