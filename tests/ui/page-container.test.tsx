import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PageContainer } from "../../components/ui/page-container";

test("shared container owns one centered 768px cap and the existing mobile gutters", () => {
	const html = renderToStaticMarkup(<PageContainer id="content" className="flex flex-col pb-10"><h1>Title</h1></PageContainer>);
	assert.match(html, /data-page-container="true"/);
	assert.match(html, /mx-auto w-full min-w-0 max-w-\[768px\] px-5/);
	assert.match(html, /id="content"/);
	assert.match(html, /flex flex-col pb-10/);
	assert.match(html, /<h1>Title<\/h1>/);
	// Keep native hero sticky positioning, carousel bleed, and viewport-fixed actions intact.
	assert.doesNotMatch(html, /overflow-hidden|transform|contain:|filter:|position:/);
});

test("all four production pages use the shared container without local width overrides", () => {
	for (const file of [
		"components/home/home-native.tsx",
		"app/statistics/page.tsx",
		"app/sessions/_components/sessions-layout.tsx",
		"app/calculator/page.tsx",
	]) {
		const source = readFileSync(file, "utf8");
		assert.match(source, /import \{ PageContainer \} from "@\/components\/ui\/page-container"/, file);
		const containers = source.match(/<PageContainer\b[^>]*>/g) ?? [];
		assert.equal(containers.length, 1, file);
		assert.doesNotMatch(containers[0], /max-w-|\bpx-/, file);
		assert.doesNotMatch(source, /max-w-\[(620|760|900)px\]/, file);
	}
});

test("Calculator retains refresh and the safe area after removing its old header", () => {
	const source = readFileSync("app/calculator/page.tsx", "utf8");
	assert.match(source, /showHeader=\{false\}/);
	assert.doesNotMatch(source, /actionOnClick|centerTitleOnMobile/);
	assert.match(source, /<Button[^>]*aria-label="Osveži Elo kalkulator"[^>]*onClick=\{refresh\}[^>]*disabled=\{loading\}/);
	assert.match(source, /pt-\[calc\(22px\+env\(safe-area-inset-top,0px\)\)\]/);
	assert.equal((source.match(/<h1\b/g) ?? []).length, 1);
});
