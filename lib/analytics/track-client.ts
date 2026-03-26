"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type TrackEventOptions = {
	page?: string;
	player_id?: string;
	userId?: string | null;
	accessToken?: string | null;
};

function getTrackingClient(accessToken?: string | null): SupabaseClient {
	if (!accessToken || !supabaseUrl || !supabaseAnonKey) {
		return supabase;
	}

	return createClient(supabaseUrl, supabaseAnonKey, {
		global: {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		},
		auth: {
			autoRefreshToken: false,
			persistSession: false,
			detectSessionInUrl: false,
		},
	});
}

/**
 * Track a client-side event to Supabase analytics_events table
 * 
 * This is fire-and-forget (non-blocking). Failures are logged but never throw.
 * 
 * Usage:
 *   trackEvent('page_viewed', { page: '/dashboard' });
 *   trackEvent('player_viewed', { player_id: 'uuid-here' });
 *   trackEvent('app_loaded');
 * 
 * @param eventName - Event name ('user_logged_in', 'app_loaded', 'page_viewed', 'player_viewed')
 * @param properties - Optional properties (page, player_id, etc.)
 */
export async function trackEvent(
	eventName: string,
	options?: TrackEventOptions,
): Promise<void> {
	try {
		const trackingClient = getTrackingClient(options?.accessToken);
		let userId = options?.userId ?? null;

		if (userId === null && !options?.accessToken) {
			const {
				data: { session },
			} = await supabase.auth.getSession();

			userId = session?.user?.id || null;
		}

		// For player_viewed events, store player_id in the page field
		// This allows us to extract it later for display
		const pageValue = options?.player_id
			? `/player/${options.player_id}`
			: options?.page || null;

		// Insert event (fire-and-forget, non-blocking)
		await trackingClient.from("analytics_events").insert({
			user_id: userId,
			event_name: eventName,
			page: pageValue,
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
