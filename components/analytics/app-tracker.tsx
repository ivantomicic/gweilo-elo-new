"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackAppLoaded, trackEvent } from "@/lib/analytics/track-client";
import { supabase } from "@/lib/supabase/client";

const LOGIN_TRACKED_USER_KEY = "analytics_tracked_login_user_id";

type AuthTrackingContext = {
	userId?: string | null;
	accessToken?: string | null;
};

async function trackCurrentPath(
	pathname: string,
	authContext?: AuthTrackingContext,
): Promise<void> {
	const playerPageMatch = pathname.match(/^\/player\/([a-f0-9-]+)$/i);

	if (playerPageMatch) {
		const playerId = playerPageMatch[1];
		await trackEvent("player_viewed", {
			player_id: playerId,
			userId: authContext?.userId,
			accessToken: authContext?.accessToken,
		});
		return;
	}

	await trackEvent("page_viewed", {
		page: pathname,
		userId: authContext?.userId,
		accessToken: authContext?.accessToken,
	});
}

/**
 * AppTracker component
 * 
 * Tracks:
 * - app_loaded (once per session on mount)
 * - page_viewed (on route change)
 * - user_logged_in (for every auth flow)
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

	// Track login for all auth flows and attribute the current page after sign-in
	useEffect(() => {
		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((event, session) => {
			if (typeof window === "undefined") {
				return;
			}

			if (event === "SIGNED_OUT") {
				sessionStorage.removeItem(LOGIN_TRACKED_USER_KEY);
				return;
			}

			if (event !== "SIGNED_IN" || !session?.user) {
				return;
			}

			const trackedUserId = sessionStorage.getItem(LOGIN_TRACKED_USER_KEY);
			if (trackedUserId === session.user.id) {
				return;
			}

			sessionStorage.setItem(LOGIN_TRACKED_USER_KEY, session.user.id);

			const authContext = {
				userId: session.user.id,
				accessToken: session.access_token,
			};

			trackEvent("user_logged_in", authContext).catch((err) => {
				console.error("[Analytics] Failed to track user_logged_in", err);
			});

			if (pathname) {
				trackCurrentPath(pathname, authContext).catch((err) => {
					console.error("[Analytics] Failed to track signed-in page", err);
				});
			}
		});

		return () => subscription.unsubscribe();
	}, [pathname]);

	// Track page_viewed or player_viewed on route change
	useEffect(() => {
		if (pathname) {
			trackCurrentPath(pathname).catch((err) => {
				console.error("[Analytics] Failed to track page view", err);
			});
		}
	}, [pathname]);

	return null; // No UI
}
