"use client";

import * as React from "react";
import Image from "next/image";

import loadingQuotes from "@/shared/loading-quotes.json";
import { cn } from "@/lib/utils";

export type LoadingSize = "xs" | "sm" | "md" | "lg" | "xl";

const mediaSizeClasses: Record<LoadingSize, string> = {
	xs: "size-6",
	sm: "size-[72px]",
	md: "size-[108px]",
	lg: "size-[132px]",
	xl: "size-[172px]",
};

const quoteSizeClasses: Record<LoadingSize, string> = {
	xs: "text-xs",
	sm: "text-[13px] leading-[18px]",
	md: "text-sm leading-5",
	lg: "text-[15px] leading-5",
	xl: "text-[15px] leading-5",
};

function randomQuoteIndex() {
	if (loadingQuotes.length <= 1) return 0;

	if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
		const value = new Uint32Array(1);
		crypto.getRandomValues(value);
		return value[0] % loadingQuotes.length;
	}

	return Math.floor(Math.random() * loadingQuotes.length);
}

function useLoadingQuote() {
	const [quote, setQuote] = React.useState(loadingQuotes[0]);

	React.useEffect(() => {
		setQuote(loadingQuotes[randomQuoteIndex()]);
	}, []);

	return quote;
}

export interface LoadingProps
	extends Omit<React.HTMLAttributes<HTMLDivElement>, "aria-label"> {
	/** The operation announced to assistive technology. */
	label?: string;
	size?: LoadingSize;
	showsQuote?: boolean;
	description?: React.ReactNode;
	/** Compatibility for older compact call sites. Prefer size="sm". */
	inline?: boolean;
}

/**
 * Canonical in-flow loading state. It mirrors the native animation, quote,
 * proportions, and reduced-motion poster fallback.
 */
export function Loading({
	label = "Učitavam…",
	size = "lg",
	showsQuote,
	description,
	inline = false,
	className,
	role = "status",
	"aria-live": ariaLive = "polite",
	...props
}: LoadingProps) {
	const quote = useLoadingQuote();
	const resolvedSize = inline && size === "lg" ? "sm" : size;
	const shouldShowQuote = showsQuote ?? !inline;
	const Root = inline ? "span" : "div";
	const Content = inline ? "span" : "div";
	const Media = inline ? "span" : "div";

	return (
		<Root
			role={role}
			aria-live={ariaLive}
			aria-label={label}
			aria-busy="true"
			className={cn(
				"flex w-full flex-col items-center justify-center text-center",
				className,
			)}
			{...props}
		>
			<Content className="flex max-w-sm flex-col items-center gap-3">
				<Media
					aria-hidden="true"
					className={cn(
						"relative shrink-0 overflow-hidden mix-blend-screen",
						mediaSizeClasses[resolvedSize],
					)}
				>
					{/* Poster stays visible if playback is unavailable or motion is reduced. */}
					<Image
						src="/loading/gweilo-loader-poster.png"
						alt=""
						fill
						sizes="172px"
						className="absolute inset-0 size-full object-contain"
					/>
					<video
						autoPlay
						loop
						muted
						playsInline
						preload="auto"
						poster="/loading/gweilo-loader-poster.png"
						className="absolute inset-0 size-full object-contain motion-reduce:hidden"
					>
						<source src="/loading/gweilo-loader.mp4" type="video/mp4" />
					</video>
				</Media>

				{shouldShowQuote ? (
					<p
						aria-hidden="true"
						className={cn(
							"line-clamp-3 max-w-[320px] px-5 font-medium italic text-muted-foreground",
							quoteSizeClasses[resolvedSize],
						)}
					>
						{quote}
					</p>
				) : null}

				{description ? (
					<div className="max-w-sm text-sm leading-5 text-muted-foreground/80">
						{description}
					</div>
				) : null}
			</Content>
		</Root>
	);
}

export interface FullScreenLoadingProps
	extends Omit<LoadingProps, "size" | "inline"> {
	contained?: boolean;
}

/** Page-sized instance of the regular loader; never covers the app navigation. */
export function PageLoading({
	className,
	...props
}: Omit<LoadingProps, "size" | "inline">) {
	return (
		<Loading
			{...props}
			size="xl"
			className={cn("min-h-[60svh] py-10", className)}
		/>
	);
}

/**
 * Reserved for standalone flows and true app/auth bootstrap, before the shell
 * is available. Route data loading must use PageLoading inside the app shell.
 */
export function FullScreenLoading({
	label = "Učitavam…",
	contained = false,
	className,
	...props
}: FullScreenLoadingProps) {
	return (
		<div
			className={cn(
				"flex w-full items-center justify-center bg-background",
				contained
					? "min-h-[320px]"
					: "fixed inset-0 z-40 min-h-[100svh]",
				className,
			)}
		>
			<Loading label={label} size="xl" className="min-h-0" {...props} />
		</div>
	);
}
