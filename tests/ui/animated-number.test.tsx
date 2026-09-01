import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AnimatedNumber } from "../../components/ui/animated-number";

for (const [value, expected] of [[1588, "1.588"], [0, "0"], [99, "99"], [-12, "-12"], [1999.6, "2.000"]] as const) {
	test(`animated number preserves the real formatted value before hydration: ${value}`, () => {
		const html = renderToStaticMarkup(<AnimatedNumber value={value} />);
		assert.ok(html.includes(`<span class="sr-only">${expected}</span>`));
		assert.ok(html.includes(`<span aria-hidden="true" style="visibility:visible">${expected}</span>`));
		assert.match(html, /data-number-phase="idle"/);
		// The animated custom element is a decoration, not a second AT announcement.
		assert.match(html, /<span aria-hidden="true"[^>]*style="visibility:hidden"><number-flow-react/);
		assert.doesNotMatch(html, /aria-live/);
	});
}
