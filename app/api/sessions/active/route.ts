import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

/**
 * GET /api/sessions/active
 *
 * Fetch the latest active session for the current user
 *
 * Security:
 * - Requires authentication
 * - Only returns sessions created by the authenticated user
 * - Active = latest session with no finished_at (for now, just the latest session)
 */
export async function GET(request: NextRequest) {
	try {
		// Get JWT token from Authorization header
		const authHeader = request.headers.get("authorization");
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 }
			);
		}

		const token = authHeader.replace("Bearer ", "");

		// Create Supabase client with user's JWT token (so RLS works correctly)
		const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
				{ status: 401 }
			);
		}

		// Fetch latest active session created by the user
		const { data: session, error: sessionError } = await supabase
			.from("sessions")
			.select("*")
			.eq("created_by", user.id)
			.eq("status", "active")
			.order("created_at", { ascending: false })
			.limit(1)
			.single();

		if (sessionError) {
			// If no session found, that's okay - just return null
			if (sessionError.code === "PGRST116") {
				return NextResponse.json({ session: null });
			}
			console.error("Error fetching active session:", sessionError);
			return NextResponse.json(
				{ error: "Failed to fetch active session" },
				{ status: 500 }
			);
		}

		return NextResponse.json({ session });
	} catch (error) {
		console.error("Unexpected error in GET /api/sessions/active:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}

