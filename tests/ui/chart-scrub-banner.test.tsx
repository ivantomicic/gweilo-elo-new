import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ChartScrubBanner, type ChartScrubMatch } from "../../components/player/chart-scrub-banner";

const match: ChartScrubMatch = {
	match: 109, date: "2026-03-05T18:00:00Z", opponent: "Milan", elo: 1580,
	delta: -4, result: "loss", scoreFor: 0, scoreAgainst: 5,
};

test("idle, win, loss, draw, and incomplete states share one fixed-height shell", () => {
	for (const point of [null, match, { ...match, result: "win", scoreFor: 5, scoreAgainst: 0, delta: 4 }, { ...match, result: "draw", scoreFor: 3, scoreAgainst: 3, delta: 0 }, { match: 1, elo: 1500, date: "" }] as (ChartScrubMatch | null)[]) {
		const html = renderToStaticMarkup(<ChartScrubBanner point={point} />);
		assert.match(html, /h-\[88px\] min-h-\[88px\]/);
		assert.match(html, /grid-rows-\[16px_36px\]/);
		assert.doesNotMatch(html, /border-l-\[3px\]|animation|transition|aria-live/);
	}
});

test("zero score is preserved; result, Elo delta, and resulting rating are distinct", () => {
	const html = renderToStaticMarkup(<ChartScrubBanner point={match} />);
	assert.match(html, /Poraz, rezultat 0–5/);
	assert.match(html, /Promena −4 Elo/);
	assert.match(html, /1\.580 Elo posle meča/);
	assert.doesNotMatch(html, /text-\[rgb\(var\(--ds-native-amber\)\)\]/);
});

test("missing score and Elo delta remain unknown rather than becoming a win or zero", () => {
	const html = renderToStaticMarkup(<ChartScrubBanner point={{ match: 1, date: "bad-date", elo: 1500 }} />);
	assert.match(html, /Nepoznat protivnik/);
	assert.match(html, /Rezultat nije zabeležen/);
	assert.match(html, /Promena Elo rejtinga nije zabeležena/);
	assert.doesNotMatch(html, /NaN|Invalid Date|Pobeda|Poraz/);
});

test("long opponent names remain accessible while the visible line truncates", () => {
	const opponent = "Aleksandar sa veoma dugačkim prezimenom";
	const html = renderToStaticMarkup(<ChartScrubBanner point={{ ...match, opponent }} />);
	assert.ok(html.includes(`title="${opponent}"`));
	assert.match(html, /truncate text-ios-body/);
});

test("the score and outcome share the middle column between equal flexible sides", () => {
	const html = renderToStaticMarkup(<ChartScrubBanner point={match} />);
	assert.match(html, /grid-cols-\[minmax\(0,1fr\)_72px_minmax\(0,1fr\)\]/);
	assert.match(html, /data-chart-scrub-result="true" class="min-w-0 text-center"><strong[^>]+>0–5<\/strong><p[^>]+>Poraz<\/p>/);
	assert.doesNotMatch(html, /border-l/);
});
