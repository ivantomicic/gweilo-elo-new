"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { HERO_MAX_BLUR, heroFadeProgress } from "../../lib/ui/scroll-fade-hero";

type ScrollFadeHeroProps = {
	title: string;
	eyebrow: string;
	videoSrc: string;
	titleTracking?: string;
	eyebrowTracking?: string;
};

/** Direct child of the page content, so sticky isn't confined to a short header. */
export function ScrollFadeHero({
	title,
	eyebrow,
	videoSrc,
	titleTracking = "0.2px",
	eyebrowTracking = "2px",
}: ScrollFadeHeroProps) {
	const anchor = useRef<HTMLDivElement>(null);
	const hero = useRef<HTMLElement>(null);
	const video = useRef<HTMLVideoElement>(null);
	const reduceMotion = useReducedMotion();
	const { scrollY } = useScroll();
	const progress = useTransform(scrollY, heroFadeProgress);
	const opacity = useTransform(progress, (value) => (1 - value) ** 2);
	const filter = useTransform(progress, (value) =>
		reduceMotion ? "none" : `blur(${value * HERO_MAX_BLUR}px)`,
	);

	useEffect(() => {
		const marker = anchor.current;
		const element = hero.current;
		if (!marker || !element) return;

		// Preserve the initial screen position, including safe area and desktop
		// chrome. Measure the non-sticky marker, never the moving/stuck hero.
		const measure = () => {
			element.style.top = `${marker.getBoundingClientRect().top + window.scrollY}px`;
		};
		measure();
		const observer = new ResizeObserver(measure);
		if (marker.parentElement) observer.observe(marker.parentElement);
		window.addEventListener("resize", measure);
		window.addEventListener("pageshow", measure);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", measure);
			window.removeEventListener("pageshow", measure);
		};
	}, []);

	useEffect(() => {
		const media = video.current;
		if (!media) return;
		let wasPlaying: boolean | undefined;
		const syncPlayback = () => {
			const shouldPlay = !reduceMotion && !document.hidden && opacity.get() > 0;
			if (shouldPlay === wasPlaying) return;
			wasPlaying = shouldPlay;
			if (shouldPlay) void media.play().catch(() => { /* Autoplay may be blocked. */ });
			else media.pause();
		};
		syncPlayback();
		const unsubscribe = opacity.on("change", syncPlayback);
		document.addEventListener("visibilitychange", syncPlayback);
		return () => {
			unsubscribe();
			document.removeEventListener("visibilitychange", syncPlayback);
			media.pause();
		};
	}, [opacity, reduceMotion, videoSrc]);

	return (
		<>
			<div ref={anchor} className="h-0" aria-hidden="true" />
			<motion.header
				ref={hero}
				data-scroll-fade-hero
				className="pointer-events-none sticky top-0 z-0 pt-[18px] motion-reduce:!filter-none"
				style={{ opacity, filter }}
			>
				<div className="relative flex min-h-[104px] items-start gap-2 overflow-visible">
					<div className="relative z-10 space-y-[5px]">
						<p
							className="font-session-label text-ios-label-12 font-semibold uppercase leading-[15px] text-ds-control-selected"
							style={{ letterSpacing: eyebrowTracking }}
						>
							{eyebrow}
						</p>
						<h1
							className="font-session-display text-ios-display-46 font-black uppercase leading-[59px] text-ds-button-foreground"
							style={{ letterSpacing: titleTracking }}
						>
							{title}
						</h1>
					</div>
					<div className="pointer-events-none absolute -right-[10px] -top-[42px] size-[148px] overflow-hidden" aria-hidden="true">
						<video ref={video} className="size-full object-contain mix-blend-screen" autoPlay={!reduceMotion} loop muted playsInline preload="auto">
							<source src={videoSrc} type="video/mp4" />
						</video>
					</div>
				</div>
			</motion.header>
		</>
	);
}
