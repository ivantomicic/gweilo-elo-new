import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, verifyUser } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
	"Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
	Vary: "Authorization",
};

/**
 * GET /api/sessions/active
 *
 * Returns the club-wide active session to every authenticated member. Session
 * creation is club-wide, so all clients must guard against the same active row.
 */
export async function GET(request: NextRequest) {
	try {
		const authorization = request.headers.get("authorization");
		const auth = await verifyUser(authorization);
		if (!auth) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401, headers: NO_STORE_HEADERS },
			);
		}

		// The active session belongs to the whole club, not only its creator.
		// Authentication above controls access; the server client deliberately
		// bypasses creator-scoped RLS so every authenticated member sees it.
		const supabase = createAdminClient();
		const { data: session, error } = await supabase
			.from("sessions")
			.select("*")
			.eq("status", "active")
			.order("created_at", { ascending: false })
			.limit(1)
			.maybeSingle();

		if (error) {
			console.error("Error fetching active session:", error);
			return NextResponse.json(
				{ error: "Failed to fetch active session" },
				{ status: 500, headers: NO_STORE_HEADERS },
			);
		}

		return NextResponse.json(
			{ session: session ?? null },
			{ headers: NO_STORE_HEADERS },
		);
	} catch (error) {
		console.error("Unexpected error in GET /api/sessions/active:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500, headers: NO_STORE_HEADERS },
		);
	}
}
