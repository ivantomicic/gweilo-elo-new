import assert from "node:assert/strict";
import test from "node:test";

import {
	ONSCREEN_KEYBOARD_MIN_OCCLUSION,
	isOnscreenKeyboardVisible,
} from "../../lib/ui/onscreen-keyboard";

test("desktop field focus does not trigger keyboard presentation", () => {
	assert.equal(
		isOnscreenKeyboardVisible({
			hasFocusedField: true,
			hasTouchInput: false,
			baselineHeight: 900,
			viewportHeight: 600,
		}),
		false,
	);
});

test("touch focus without viewport occlusion does not trigger keyboard presentation", () => {
	assert.equal(
		isOnscreenKeyboardVisible({
			hasFocusedField: true,
			hasTouchInput: true,
			baselineHeight: 800,
			viewportHeight: 800,
		}),
		false,
	);
});

test("small browser chrome changes are not mistaken for an onscreen keyboard", () => {
	assert.equal(
		isOnscreenKeyboardVisible({
			hasFocusedField: true,
			hasTouchInput: true,
			baselineHeight: 800,
			viewportHeight: 800 - ONSCREEN_KEYBOARD_MIN_OCCLUSION,
		}),
		false,
	);
});

test("a focused touch viewport with substantial occlusion detects the keyboard", () => {
	assert.equal(
		isOnscreenKeyboardVisible({
			hasFocusedField: true,
			hasTouchInput: true,
			baselineHeight: 800,
			viewportHeight: 500,
		}),
		true,
	);
});

test("viewport occlusion alone does not trigger after the field blurs", () => {
	assert.equal(
		isOnscreenKeyboardVisible({
			hasFocusedField: false,
			hasTouchInput: true,
			baselineHeight: 800,
			viewportHeight: 500,
		}),
		false,
	);
});
