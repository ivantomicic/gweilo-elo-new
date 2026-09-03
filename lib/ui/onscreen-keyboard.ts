export const ONSCREEN_KEYBOARD_MIN_OCCLUSION = 120;
export const ONSCREEN_KEYBOARD_MIN_OCCLUSION_RATIO = 0.18;

type OnscreenKeyboardVisibilityInput = {
	hasFocusedField: boolean;
	hasTouchInput: boolean;
	baselineHeight: number;
	viewportHeight: number;
};

export function isOnscreenKeyboardVisible({
	hasFocusedField,
	hasTouchInput,
	baselineHeight,
	viewportHeight,
}: OnscreenKeyboardVisibilityInput) {
	if (!hasFocusedField || !hasTouchInput || baselineHeight <= 0) {
		return false;
	}

	const minimumOcclusion = Math.max(
		ONSCREEN_KEYBOARD_MIN_OCCLUSION,
		baselineHeight * ONSCREEN_KEYBOARD_MIN_OCCLUSION_RATIO,
	);

	return baselineHeight - viewportHeight >= minimumOcclusion;
}
