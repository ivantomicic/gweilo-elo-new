import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

// Type-safe URLs (after the check above, they're guaranteed to be strings)
const supabaseUrlSafe = supabaseUrl as string;
const supabaseAnonKeySafe = supabaseAnonKey as string;

/**
 * Track a server-side event to Supabase analytics_events table
 * 
 * This is fire-and-forget (non-blocking). Failures are logged but never throw.
 * Used for backend events like user_logged_in.
 * 
 * Usage:
 *   await trackServerEvent('user_logged_in', userId);
 * 
 * @param eventName - Event name ('user_logged_in')
 * @param userId - User UUID (required for server-side events)
 */
export async function trackServerEvent(
	eventName: string,
	userId: string
): Promise<void> {
	try {
		// Create Supabase client with service role (for server-side inserts)
		// Note: In production, this should use service role key for admin inserts
		// For now, we'll use anon key with user context (RLS will enforce permissions)
		const supabase = createClient(supabaseUrlSafe, supabaseAnonKeySafe);

		// Insert event (fire-and-forget)
		await supabase.from("analytics_events").insert({
			user_id: userId,
			event_name: eventName,
			page: null, // Server-side events don't have pages
			created_at: new Date().toISOString(),
		});
	} catch (error) {
		// Fail silently - tracking should never break the request
		console.error(`[Analytics] Failed to track server event: ${eventName}`, error);
	}
}
