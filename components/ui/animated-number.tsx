"use client";

import NumberFlow, { useCanAnimate } from "@number-flow/react";
import { useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const FORMAT = { maximumFractionDigits: 0 } satisfies Intl.NumberFormatOptions;
const TIMING = { duration: 650, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" };
const OPACITY_TIMING = { duration: 240, easing: "ease-out" };

/** Rolls once when visible. Real text reserves space and remains available to AT. */
export function AnimatedNumber({ value, animate = true }: { value: number; animate?: boolean }) {
	const root = useRef<HTMLSpanElement>(null);
	const canAnimate = useCanAnimate();
	const inView = useInView(root, { once: true, amount: 0.5 });
	const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
	const rounded = Math.round(value);
	const formatted = rounded.toLocaleString("sr-Latn-RS", FORMAT);
	const showFlow = canAnimate && animate;

	useEffect(() => {
		if (!animate || !canAnimate || !inView || phase !== "idle") return;
		// Keyboard navigation must stay immediate. Do not roll again on updates.
		if (document.querySelector(":focus-visible")) {
			setPhase("done");
			return;
		}
		// Wait for the containing section's remaining delay, so digits do not
		// finish rolling while hidden. Already-revealed sections start immediately.
		const entrance = root.current?.closest("[data-number-entrance]");
		const animation = entrance?.getAnimations().find((item) => item.playState === "running");
		const remainingDelay = animation
			? Math.max(0, (animation.effect?.getTiming().delay ?? 0) - Number(animation.currentTime ?? 0))
			: 0;
		let firstFrame = 0;
		let secondFrame = 0;
		const start = window.setTimeout(() => {
			firstFrame = requestAnimationFrame(() => {
				secondFrame = requestAnimationFrame(() => setPhase("running"));
			});
		}, remainingDelay);
		return () => {
			window.clearTimeout(start);
			cancelAnimationFrame(firstFrame);
			cancelAnimationFrame(secondFrame);
		};
	}, [animate, canAnimate, inView, phase]);

	useEffect(() => {
		if (phase !== "running") return;
		const timeout = window.setTimeout(() => setPhase("done"), TIMING.duration);
		return () => window.clearTimeout(timeout);
	}, [phase]);

	return (
		<span ref={root} className="relative inline-block tabular-nums" data-number-phase={phase}>
			<span className="sr-only">{formatted}</span>
			<span aria-hidden="true" style={{ visibility: showFlow ? "hidden" : "visible" }}>{formatted}</span>
			<span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ visibility: showFlow ? "visible" : "hidden" }}>
				<NumberFlow
					value={phase === "idle" ? 0 : rounded}
					locales="sr-Latn-RS"
					format={FORMAT}
					animated={animate && canAnimate && phase === "running"}
					respectMotionPreference
					transformTiming={TIMING}
					spinTiming={TIMING}
					opacityTiming={OPACITY_TIMING}
					trend={1}
					className="block whitespace-nowrap [--number-flow-mask-height:0.08em] [--number-flow-mask-width:0.08em]"
				/>
			</span>
		</span>
	);
}
