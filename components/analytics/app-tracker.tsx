"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackAppLoaded, trackEvent } from "@/lib/analytics/track-client";

/**
 * AppTracker component
 * 
 * Tracks:
 * - app_loaded (once per session on mount)
 * - page_viewed (on route change)
 * 
 * Place this in the root layout (client component wrapper).
 */
export function AppTracker() {
	const pathname = usePathname();

	// Track app_loaded once per session
	useEffect(() => {
		trackAppLoaded().catch((err) => {
			console.error("[Analytics] Failed to track app_loaded", err);
		});
	}, []); // Only on mount

	// Track page_viewed on route change
	useEffect(() => {
		if (pathname) {
			trackEvent("page_viewed", { page: pathname }).catch((err) => {
				console.error("[Analytics] Failed to track page_viewed", err);
			});
		}
	}, [pathname]);

	return null; // No UI
}
