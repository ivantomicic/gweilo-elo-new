import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ScrollFadeHero } from "../../components/ui/scroll-fade-hero";
import { HERO_FADE_DISTANCE, HERO_MAX_BLUR, heroFadeProgress } from "../../lib/ui/scroll-fade-hero";

test("the hero is visible at the top and fully faded after 120px", () => {
	assert.equal(HERO_FADE_DISTANCE, 120);
	assert.equal(heroFadeProgress(0), 0);
	assert.equal(heroFadeProgress(60), 0.5);
	assert.equal(heroFadeProgress(120), 1);
	assert.equal(heroFadeProgress(1200), 1);
	assert.equal(HERO_MAX_BLUR, 6);
});

test("overscroll does not increase opacity or produce a negative blur", () => {
	assert.equal(heroFadeProgress(-100), 0);
	for (let offset = 0; offset <= 120; offset++) {
		assert.ok(heroFadeProgress(offset) >= heroFadeProgress(offset - 1));
		assert.ok(heroFadeProgress(offset) >= 0 && heroFadeProgress(offset) <= 1);
	}
});

test("return scrolling reverses the same curve without retained animation state", () => {
	const offsets = [0, 30, 60, 90, 120];
	assert.deepEqual(
		offsets.map(heroFadeProgress),
		[...offsets].reverse().map(heroFadeProgress).reverse(),
	);
	assert.ok(heroFadeProgress(10) < 0.03);
	assert.ok(heroFadeProgress(110) > 0.97);
});

test("both pages use an accessible, in-flow hero with decorative video only", () => {
	for (const props of [
		{ title: "Termini", eyebrow: "Istorija mečeva", videoSrc: "/sessions-header.mp4" },
		{ title: "Statistika", eyebrow: "Trenutni Elo", videoSrc: "/rankings-header.mp4", titleTracking: "-0.5px" },
	]) {
		const html = renderToStaticMarkup(<ScrollFadeHero {...props} />);
		assert.match(html, /data-scroll-fade-hero="true"/);
		assert.match(html, /sticky top-0/);
		assert.match(html, /min-h-\[104px\]/);
		assert.match(html, /motion-reduce:!filter-none/);
		assert.match(html, /opacity:1/);
		assert.match(html, new RegExp(`<h1[^>]*>${props.title}</h1>`));
		assert.ok(html.includes(`src="${props.videoSrc}"`));
		assert.match(html, /aria-hidden="true"><video/);
		assert.doesNotMatch(html, /<button|<a |role="tab"|aria-hidden="true"[^>]*><h1/);
	}
});
