import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, verifyUser } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/sessions/active
 *
 * Returns the club-wide active session to every authenticated member. Session
 * creation is club-wide, so all clients must guard against the same active row.
 */
export async function GET(request: NextRequest) {
	try {
		const auth = await verifyUser(request.headers.get("authorization"));
		if (!auth) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 },
			);
		}

		const { data: session, error } = await createAdminClient()
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
				{ status: 500 },
			);
		}

		return NextResponse.json({ session: session ?? null });
	} catch (error) {
		console.error("Unexpected error in GET /api/sessions/active:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
