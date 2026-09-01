import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";

const css = postcss.parse(readFileSync("app/globals.css", "utf8"));
function values(selector: string, property: string) {
	const result: string[] = [];
	css.walkRules(selector, rule => {
		rule.walkDecls(property, decl => { result.push(decl.value); });
	});
	return result;
}

test("glass exposes content through a low-alpha fill and one light backdrop blur", () => {
	assert.deepEqual(values(".mobile-nav__bar", "background-color"), ["rgb(var(--ds-native-raised) / 0.08)"]);
	assert.deepEqual(values(".mobile-nav__bar", "backdrop-filter"), ["blur(12px) saturate(135%)"]);
	assert.deepEqual(values(".mobile-nav__bar", "-webkit-backdrop-filter"), values(".mobile-nav__bar", "backdrop-filter"));
	assert.deepEqual(values(".mobile-nav__selection", "backdrop-filter"), []);
	assert.deepEqual(values(".mobile-nav__selection", "border-radius"), ["9999px"]);
});

test("glass retains explicit reduced-transparency, contrast and unsupported-browser fallbacks", () => {
	let fallback = false;
	let preferences = false;
	css.walkAtRules(rule => {
		if (rule.name === "supports" && rule.params.startsWith("not ((-webkit-backdrop-filter")) {
			fallback = rule.toString().includes("/ 0.96)");
		}
		if (rule.name === "media" && rule.params.includes("prefers-reduced-transparency")) {
			preferences = rule.params.includes("prefers-contrast: more") && rule.toString().includes("backdrop-filter: none");
		}
	});
	assert.equal(fallback, true);
	assert.equal(preferences, true);
	assert.deepEqual(values(".mobile-nav__item", "min-height"), ["56px"]);
});
