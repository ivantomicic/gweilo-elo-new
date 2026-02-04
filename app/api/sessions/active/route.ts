import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthToken } from "../../_utils/auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

/**
 * GET /api/sessions/active
 *
 * Fetch the latest active session
 *
 * Security:
 * - Requires authentication
 * - Regular users: only returns their own active sessions
 * - Admins: returns ANY active session (most recent first)
 * - Active = session with status "active"
 */
export async function GET(request: NextRequest) {
	try {
		// Get JWT token from Authorization header or X-Supabase-Token
		const token = getAuthToken(request);
		if (!token) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 },
			);
		}

		// Create Supabase client with user's JWT token (so RLS works correctly)
		const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
			global: {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		});

		// Verify user is authenticated
		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser(token);

		if (userError || !user) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 },
			);
		}

		// Check if user is admin
		const isAdmin = user.user_metadata?.role === "admin";

		// Build query
		let query = supabase
			.from("sessions")
			.select("*")
			.eq("status", "active")
			.order("created_at", { ascending: false })
			.limit(1);

		// For non-admins, only show their own sessions
		if (!isAdmin) {
			query = query.eq("created_by", user.id);
		}

		const { data: session, error: sessionError } = await query.single();

		if (sessionError) {
			// If no session found, that's okay - just return null
			if (sessionError.code === "PGRST116") {
				return NextResponse.json({ session: null });
			}
			console.error("Error fetching active session:", sessionError);
			return NextResponse.json(
				{ error: "Failed to fetch active session" },
				{ status: 500 },
			);
		}

		return NextResponse.json({ session });
	} catch (error) {
		console.error("Unexpected error in GET /api/sessions/active:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
