"use client";

import { supabase } from "@/lib/supabase/client";

/**
 * Track a client-side event to Supabase analytics_events table
 * 
 * This is fire-and-forget (non-blocking). Failures are logged but never throw.
 * 
 * Usage:
 *   trackEvent('page_viewed', { page: '/dashboard' });
 *   trackEvent('app_loaded');
 * 
 * @param eventName - Event name ('user_logged_in', 'app_loaded', 'page_viewed')
 * @param properties - Optional properties (page, etc.)
 */
export async function trackEvent(
	eventName: string,
	properties?: { page?: string }
): Promise<void> {
	try {
		// Get current user ID (if authenticated)
		const {
			data: { session },
		} = await supabase.auth.getSession();

		const userId = session?.user?.id || null;

		// Insert event (fire-and-forget, non-blocking)
		await supabase.from("analytics_events").insert({
			user_id: userId,
			event_name: eventName,
			page: properties?.page || null,
			created_at: new Date().toISOString(),
		});
	} catch (error) {
		// Fail silently - tracking should never break the app
		console.error(`[Analytics] Failed to track event: ${eventName}`, error);
	}
}

/**
 * Track app_loaded event (once per session)
 * 
 * Uses sessionStorage to ensure it only fires once per browser session.
 */
export async function trackAppLoaded(): Promise<void> {
	if (typeof window === "undefined") return;

	// Check if already tracked in this session
	const hasTracked = sessionStorage.getItem("analytics_app_loaded");
	if (hasTracked === "true") {
		return; // Already tracked
	}

	// Mark as tracked
	sessionStorage.setItem("analytics_app_loaded", "true");

	// Track event
	await trackEvent("app_loaded");
}
