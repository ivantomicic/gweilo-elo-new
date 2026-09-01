import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AnimatedNumber } from "../../components/ui/animated-number";
import { HOME_ENTRANCE_SETTLE_MS } from "../../components/home/use-home-entrance";

const home = readFileSync("components/home/home-native.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const lifecycle = readFileSync("components/ui/use-page-entrance.ts", "utf8");

test("homepage sparkline has no endpoint marker that can stretch with its responsive SVG", () => {
	const sparkline = home.slice(home.indexOf("function HomeSparkline("), home.indexOf("function MyStanding("));
	assert.match(sparkline, /d=\{segmentPath\(coordinates, index\)\}/);
	assert.match(sparkline, /vectorEffect="non-scaling-stroke"/);
	assert.doesNotMatch(sparkline, /<circle|<ellipse|markerEnd|const endpoint/);
});

test("homepage follows the approved profile cadence in reading order", () => {
	assert.match(css, /home-enter 480ms cubic-bezier\(0\.22, 0\.61, 0\.36, 1\) backwards/);
	for (const [stage, delay] of [["mascot", 120], ["podium", 240], ["standing", 360], ["missions", 480], ["sessions", 600]]) {
		assert.ok(css.includes(`.home-enter-${stage} { --home-enter-delay: ${delay}ms; }`));
	}
	assert.ok(HOME_ENTRANCE_SETTLE_MS > 600 + 480);
	assert.ok(HOME_ENTRANCE_SETTLE_MS > 360 + 650 + 34);
});

test("entrance never animates the page shell, nav, or start-session action", () => {
	const root = home.match(/<PageContainer\b[^>]*>/)?.[0];
	assert.ok(root);
	assert.match(root, /data-skip-entrance=\{skipEntrance\}/);
	assert.doesNotMatch(root, /home-enter|transform|overflow-hidden/);
	assert.doesNotMatch(readFileSync("components/mobile-nav.tsx", "utf8"), /home-enter/);
});

test("video fades preserve blending and do not replace positioning transforms", () => {
	assert.match(css, /@keyframes home-media-enter\s*\{\s*from \{ opacity: 0; \}\s*to \{ opacity: 1; \}\s*\}/);
	assert.match(home, /home-media-enter home-enter-podium[^"\n]*mix-blend-screen/);
	assert.match(home, /home-media-enter home-enter-mascot[^"\n]*mix-blend-screen/);
	// Animate the leaves, not a common video ancestor that would isolate its blend.
	assert.doesNotMatch(home.match(/<header\b[^>]*>/)?.[0] ?? "", /home-enter/);
	assert.doesNotMatch(home.match(/<Link[\s\S]*?aria-label=\{`Mesto/)?.[0] ?? "", /home-enter/);
	assert.match(css, /to \{ opacity: 1; transform: none; \}/);
});

test("reduced motion, keyboard, pointer, and restored pages end the entrance", () => {
	assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.home-enter,/);
	assert.match(css, /\.home-native\[data-skip-entrance="true"\] \.home-media-enter \{\s*animation: none;/);
	for (const event of ["keydown", "pointerdown", "pageshow", "visibilitychange", "change"]) {
		assert.ok(lifecycle.includes(`addEventListener("${event}"`));
		assert.ok(lifecycle.includes(`removeEventListener("${event}"`));
	}
	assert.match(lifecycle, /event\.persisted/);
	assert.match(lifecycle, /document\.querySelector\(":focus-visible"\)/);
});

test("the entrance settles only after loading and never rearms on refreshed data", () => {
	assert.match(home, /useHomeEntrance\(!loading\)/);
	assert.match(lifecycle, /if \(!ready \|\| skipEntrance\) return/);
	assert.match(lifecycle, /\[ready, skipEntrance, settleMs, finishEntrance\]/);
	assert.doesNotMatch(lifecycle, /setSkipEntrance\(false\)/);
	assert.match(lifecycle, /window\.clearTimeout\(timer\)/);
	assert.match(home, /<HomeContent\s+data=\{data\}/);
	assert.match(home, /HOME_REFRESH_INTERVAL_MS = 15_000/);
});

test("podium and personal Elo reuse the same rolling numbers and settled-state opt-out", () => {
	assert.equal((home.match(/<AnimatedNumber value=\{player\.elo\} animate=\{animateNumbers\}/g) ?? []).length, 2);
	assert.equal((home.match(/data-number-entrance/g) ?? []).length, 2);
	assert.equal((home.match(/animateNumbers=\{!skipEntrance\}/g) ?? []).length, 2);
});

for (const value of [0, 1_813, 1_990]) {
	test(`disabled entrance preserves the actual accessible Elo: ${value}`, () => {
		const html = renderToStaticMarkup(<AnimatedNumber value={value} animate={false} />);
		const formatted = value.toLocaleString("sr-Latn-RS");
		assert.ok(html.includes(`<span class="sr-only">${formatted}</span>`));
		assert.ok(html.includes(`<span aria-hidden="true" style="visibility:visible">${formatted}</span>`));
		assert.doesNotMatch(html, /aria-live/);
	});
}
