"use client";

import { useCallback, useEffect, useState } from "react";

/** One decorative entrance per visit. Interaction and refreshes must stay immediate. */
export function usePageEntrance(ready: boolean, settleMs = 1_400) {
	const [skipEntrance, setSkipEntrance] = useState(false);
	const finishEntrance = useCallback(() => setSkipEntrance(true), []);

	useEffect(() => {
		const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
		const onMotionChange = () => { if (motion.matches) finishEntrance(); };
		const onVisibilityChange = () => {
			if (document.visibilityState === "hidden") finishEntrance();
		};
		const onPageShow = (event: PageTransitionEvent) => {
			if (event.persisted) finishEntrance();
		};

		if (motion.matches || document.hidden || document.querySelector(":focus-visible")) finishEntrance();
		window.addEventListener("keydown", finishEntrance, { once: true, capture: true });
		window.addEventListener("pointerdown", finishEntrance, { once: true, capture: true });
		window.addEventListener("pageshow", onPageShow);
		document.addEventListener("visibilitychange", onVisibilityChange);
		motion.addEventListener("change", onMotionChange);
		return () => {
			window.removeEventListener("keydown", finishEntrance, true);
			window.removeEventListener("pointerdown", finishEntrance, true);
			window.removeEventListener("pageshow", onPageShow);
			document.removeEventListener("visibilitychange", onVisibilityChange);
			motion.removeEventListener("change", onMotionChange);
		};
	}, [finishEntrance]);

	useEffect(() => {
		if (!ready || skipEntrance) return;
		const timer = window.setTimeout(finishEntrance, settleMs);
		return () => window.clearTimeout(timer);
	}, [ready, skipEntrance, settleMs, finishEntrance]);

	return { skipEntrance, finishEntrance };
}
