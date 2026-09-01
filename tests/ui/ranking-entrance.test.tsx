import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RankingEntranceItem, RANKING_ENTRANCE_ROW_LIMIT, rankingEntranceDelay } from "../../components/statistics/ranking-entrance";

const page = readFileSync("app/statistics/page.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const lifecycle = readFileSync("components/ui/use-page-entrance.ts", "utf8");
const ranking = readFileSync("components/statistics/ranking-entrance.tsx", "utf8");

test("row cadence is readable, capped, and finishes before the shared entrance settles", () => {
	assert.equal(RANKING_ENTRANCE_ROW_LIMIT, 8);
	assert.deepEqual(Array.from({ length: 8 }, (_, index) => rankingEntranceDelay(index)), [80, 150, 220, 290, 360, 430, 500, 570]);
	assert.equal(rankingEntranceDelay(100), 570);
	assert.equal(rankingEntranceDelay(-1), 80);
	assert.ok(rankingEntranceDelay(7) + 650 + 34 < 1_400);
});

test("row wrapper preserves list and keyboard semantics during entrance", () => {
	const html = renderToStaticMarkup(<RankingEntranceItem index={2} animate><button type="button" aria-label="Ivan, 1813 Elo">Ivan</button></RankingEntranceItem>);
	assert.match(html, /^<li class="ranking-enter"/);
	assert.match(html, /--ranking-enter-delay:220ms/);
	assert.match(html, /data-number-entrance/);
	assert.match(html, /<button type="button" aria-label="Ivan, 1813 Elo">Ivan<\/button>/);
	assert.doesNotMatch(html, /aria-hidden|inert|disabled|tabindex/);
});

test("settled and long-list rows remain immediately visible without entrance classes", () => {
	for (const [index, animate] of [[0, false], [7, false], [8, true], [100, true]] as const) {
		const html = renderToStaticMarkup(<RankingEntranceItem index={index} animate={animate}>Player</RankingEntranceItem>);
		assert.doesNotMatch(html, /class="ranking-enter"|opacity:0/);
		assert.ok(html.endsWith("Player</li>"));
	}
});

test("only opacity and small translation animate, gated by reduced-motion", () => {
	assert.match(css, /@keyframes ranking-enter \{\s*from \{ opacity: 0; transform: translateY\(6px\); \}\s*to \{ opacity: 1; transform: none; \}/);
	assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.ranking-enter \{\s*animation: ranking-enter 480ms cubic-bezier\(0\.22, 0\.61, 0\.36, 1\) backwards;/);
});

test("statistics and home share the interruptible one-visit lifecycle", () => {
	assert.match(readFileSync("components/home/use-home-entrance.ts", "utf8"), /usePageEntrance\(ready, HOME_ENTRANCE_SETTLE_MS\)/);
	assert.match(ranking, /usePageEntrance\(ready\)/);
	assert.match(lifecycle, /if \(!ready \|\| skipEntrance\) return/);
	assert.doesNotMatch(lifecycle, /setSkipEntrance\(false\)/);
	for (const event of ["keydown", "pointerdown", "pageshow", "visibilitychange", "change"]) {
		assert.ok(lifecycle.includes(`addEventListener("${event}"`));
		assert.ok(lifecycle.includes(`removeEventListener("${event}"`));
	}
	assert.match(lifecycle, /event\.persisted/);
	assert.match(lifecycle, /window\.clearTimeout\(timer\)/);
});

test("URL changes and tab interactions end entrance without waiting for outgoing content", () => {
	assert.match(ranking, /if \(view !== initialView\.current\) finishEntrance\(\)/);
	assert.match(ranking, /!skipEntrance && view === initialView\.current/);
	assert.match(page, /if \(view === activeView\) return;\s*finishEntrance\(\)/);
	assert.doesNotMatch(page, /AnimatePresence|pageDirection|<motion\.div/);
	assert.match(page, /shouldReduceMotion \|\| keyboardNavigation \? \{ duration: 0 \}/);
});

test("production rankings use the entrance for all categories with stable keys and actual accessible values", () => {
	assert.match(page, /<RankingEntranceItem key=\{key\} index=\{index\} animate=\{animateEntrance\}/);
	assert.match(page, /animateNumbers=\{animateEntrance && index < RANKING_ENTRANCE_ROW_LIMIT\}/);
	assert.match(page, /<AnimatedNumber value=\{item\.elo\}/);
	assert.match(page, /const key = isTeam \? item\.team_id : item\.player_id/);
	assert.match(page, /\$\{Math\.round\(item\.elo\)\} Elo/);
	assert.match(page, /loaded\[getViewKey\(activeRankingView\)\] && !error/);
	assert.match(page, /STATISTICS_REFRESH_INTERVAL_MS = 15_000/);
	assert.doesNotMatch(page.match(/<AppShell[\s\S]*?<PageContainer[^>]*>/)?.[0] ?? "", /ranking-enter/);
});
