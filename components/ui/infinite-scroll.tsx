"use client";

import { useEffect, useRef, useCallback } from "react";
import { Box } from "./box";

type InfiniteScrollProps = {
	hasMore: boolean;
	loading: boolean;
	onLoadMore: () => void;
	children: React.ReactNode;
	loader?: React.ReactNode;
	endMessage?: React.ReactNode;
	threshold?: number; // Distance from bottom in pixels to trigger load
};

/**
 * InfiniteScroll component that automatically loads more content when user scrolls near the bottom
 * 
 * @param hasMore - Whether there are more items to load
 * @param loading - Whether a load operation is in progress
 * @param onLoadMore - Callback function to load more items
 * @param children - Content to render
 * @param loader - Optional custom loader component (defaults to simple text)
 * @param endMessage - Optional message to show when all items are loaded
 * @param threshold - Distance from bottom in pixels to trigger load (default: 200)
 */
export function InfiniteScroll({
	hasMore,
	loading,
	onLoadMore,
	children,
	loader,
	endMessage,
	threshold = 200,
}: InfiniteScrollProps) {
	const observerTarget = useRef<HTMLDivElement>(null);

	const handleObserver = useCallback(
		(entries: IntersectionObserverEntry[]) => {
			const [target] = entries;
			if (target.isIntersecting && hasMore && !loading) {
				onLoadMore();
			}
		},
		[hasMore, loading, onLoadMore]
	);

	useEffect(() => {
		const element = observerTarget.current;
		if (!element) return;

		const observer = new IntersectionObserver(handleObserver, {
			root: null,
			rootMargin: `${threshold}px`,
			threshold: 0.1,
		});

		observer.observe(element);

		return () => {
			observer.unobserve(element);
		};
	}, [handleObserver, threshold]);

	return (
		<>
			{children}
			<div ref={observerTarget} />
			{loading && (
				<Box className="flex items-center justify-center py-4">
					{loader || (
						<p className="text-sm text-muted-foreground">
							Loading...
						</p>
					)}
				</Box>
			)}
			{!hasMore && !loading && endMessage && (
				<Box className="flex items-center justify-center py-4">
					{endMessage}
				</Box>
			)}
		</>
	);
}

