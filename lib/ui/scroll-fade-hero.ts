export const HERO_FADE_DISTANCE = 120;
export const HERO_MAX_BLUR = 6;

/** Scroll-linked, reversible progress: no timed animation trailing the finger. */
export function heroFadeProgress(scrollY: number) {
	const progress = Math.min(1, Math.max(0, scrollY / HERO_FADE_DISTANCE));
	return progress * progress * (3 - 2 * progress);
}
