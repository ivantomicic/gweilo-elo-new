import assert from "node:assert/strict";
import test from "node:test";
import {
	calculateOpportunityAdjustedForm,
	classifyOpportunityAdjustedForm,
	fallbackOpportunityAdjustedForm,
} from "../../lib/elo/form";

test("rates a perfect session equally for favorites and underdogs", () => {
	const favorite = calculateOpportunityAdjustedForm([
		{ actualScore: 1, expectedScore: 0.95 },
		{ actualScore: 1, expectedScore: 0.94 },
		{ actualScore: 1, expectedScore: 0.93 },
	]);
	const underdog = calculateOpportunityAdjustedForm([
		{ actualScore: 1, expectedScore: 0.05 },
		{ actualScore: 1, expectedScore: 0.06 },
		{ actualScore: 1, expectedScore: 0.07 },
	]);

	assert.equal(favorite, 1);
	assert.equal(underdog, 1);
});

test("rates an all-loss session as the worst available outcome", () => {
	assert.equal(
		calculateOpportunityAdjustedForm([
			{ actualScore: 0, expectedScore: 0.95 },
			{ actualScore: 0, expectedScore: 0.5 },
			{ actualScore: 0, expectedScore: 0.05 },
		]),
		-1,
	);
});

test("keeps performance near expectation neutral", () => {
	assert.ok(
		Math.abs(
			calculateOpportunityAdjustedForm([
				{ actualScore: 1, expectedScore: 0.75 },
				{ actualScore: 0.5, expectedScore: 0.5 },
				{ actualScore: 0, expectedScore: 0.25 },
			]),
		) < Number.EPSILON,
	);
});

test("provides a bounded fallback for incomplete historical data", () => {
	assert.equal(fallbackOpportunityAdjustedForm(4), 0.8);
	assert.equal(fallbackOpportunityAdjustedForm(20), 1);
	assert.equal(fallbackOpportunityAdjustedForm(-20), -1);
});

test("classifies adjusted scores at the shared thirty-percent boundary", () => {
	assert.equal(classifyOpportunityAdjustedForm(0.3), "good");
	assert.equal(classifyOpportunityAdjustedForm(0.299), "neutral");
	assert.equal(classifyOpportunityAdjustedForm(-0.299), "neutral");
	assert.equal(classifyOpportunityAdjustedForm(-0.3), "bad");
});
