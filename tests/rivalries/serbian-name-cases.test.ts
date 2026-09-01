import assert from "node:assert/strict";
import test from "node:test";

import { getSerbianNameCase } from "../../lib/serbian-name-cases";

test("greetings use the saved vocative, without guessing declensions", () => {
	assert.equal(getSerbianNameCase("Ivan", { vocative: "Ivane" }, "vocative"), "Ivane");
	assert.equal(getSerbianNameCase("Milan", { vocative: "Milane" }, "vocative"), "Milane");
	assert.equal(getSerbianNameCase("Marko", { vocative: "Marko" }, "vocative"), "Marko");
});

test("greetings preserve full saved names and trim incidental whitespace", () => {
	assert.equal(getSerbianNameCase("Bata", { vocative: " Bata Seno " }, "vocative"), "Bata Seno");
});

test("missing or blank vocatives preserve the existing greeting name", () => {
	for (const cases of [undefined, null, {}, { vocative: null }, { vocative: "" }, { vocative: "  " }]) {
		assert.equal(getSerbianNameCase("Ivan", cases, "vocative"), "Ivan");
	}
	assert.equal(getSerbianNameCase("Igrač", undefined, "vocative"), "Igrač");
});

test("other saved cases are not substituted for the vocative", () => {
	assert.equal(getSerbianNameCase("Ivan", { genitive: "Ivana", dative: "Ivanu" }, "vocative"), "Ivan");
});
