import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postcss, { type Rule } from "postcss";

const styles = postcss.parse(readFileSync("app/globals.css", "utf8"));

function declarations(selector: string, property: string) {
	const values: string[] = [];
	styles.walkRules(selector, (rule: Rule) => {
		rule.walkDecls(property, (declaration) => { values.push(declaration.value); });
	});
	return values;
}

// These verify the positioning contract, not browser layout or Safari chrome.
test("a fixed-only loading screen still has a full-height document canvas", () => {
	assert.deepEqual(declarations("html,\n\tbody", "min-height"), ["100vh", "100dvh"]);
	assert.deepEqual(declarations("html,\n\tbody", "height"), []);
	assert.deepEqual(declarations("html,\n\tbody", "overflow"), []);
});

test("the navigation stays viewport-fixed with no content-dependent bottom offset", () => {
	assert.deepEqual(declarations(".mobile-nav", "position"), ["fixed"]);
	assert.deepEqual(declarations(".mobile-nav", "top"), ["auto"]);
	assert.deepEqual(declarations(".mobile-nav", "bottom"), ["var(--mobile-nav-bottom)"]);
	assert.deepEqual(declarations(".mobile-nav", "transition"), []);
});

test("the session accessory uses the same anchor and dock height in every display mode", () => {
	assert.deepEqual(declarations(".mobile-nav__bar", "min-height"), ["var(--mobile-nav-height)"]);
	assert.deepEqual(declarations(".mobile-nav-accessory", "position"), ["fixed"]);
	assert.deepEqual(declarations(".mobile-nav-accessory", "bottom"), [
		"calc(var(--mobile-nav-bottom) + var(--mobile-nav-height) + 8px)",
	]);
	assert.deepEqual(declarations(":root", "--mobile-nav-bottom"), [
		"calc(6px - env(safe-area-inset-bottom, 0px))",
		"max(8px, env(safe-area-inset-bottom, 0px))",
	]);
});

test("navigation remains outside route loading and animated content", () => {
	const layout = readFileSync("app/layout.tsx", "utf8");
	assert.match(layout, /\{children\}\s*<MobileNav\s*\/>\s*<\/AuthProvider>/);
	assert.doesNotMatch(layout, /MaintenanceGuard/);
});

test("the selected lens measures inside a fixed Motion layout root", () => {
	const navigation = readFileSync("components/mobile-nav.tsx", "utf8");
	assert.match(navigation, /<motion\.nav\s+(?:\/\/[^\n]*\n\s*)?layoutRoot\s+data-mobile-nav/);
	assert.match(navigation, /<\/motion\.nav>/);
	assert.doesNotMatch(navigation, /visualViewport|scrollY|onScroll|onTouchMove/);
});

test("mobile app edge-bounce is disabled without locking document scroll or horizontal history", () => {
	const selector = "html:has([data-mobile-nav]),\n\t\tbody:has([data-mobile-nav])";
	assert.deepEqual(declarations(selector, "overscroll-behavior-y"), ["none"]);
	for (const property of ["overflow", "overflow-y", "position", "height", "touch-action", "overscroll-behavior-x"]) {
		assert.deepEqual(declarations(selector, property), []);
	}
	styles.walkRules(selector, rule => {
		assert.equal(rule.parent?.type, "atrule");
		assert.equal((rule.parent as import("postcss").AtRule).params, "(max-width: 767px)");
	});
});

test("dock and session action do not start a page pan but still allow pinch zoom", () => {
	assert.deepEqual(declarations(".mobile-nav__bar", "touch-action"), ["pinch-zoom"]);
	assert.deepEqual(declarations(".mobile-nav-accessory__button", "touch-action"), ["pinch-zoom"]);
	// The empty margin around the dock remains a normal scrollable page target.
	assert.deepEqual(declarations(".mobile-nav", "touch-action"), ["manipulation"]);
});
