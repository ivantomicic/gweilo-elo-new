import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, verifyAdmin } from "@/lib/supabase/admin";
import {
	ensureMissionSnapshotsFresh,
	generateAndStoreMissionSnapshots,
} from "@/lib/rivalries/service";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
	"Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
	Pragma: "no-cache",
};

export async function GET(request: NextRequest) {
	try {
		const authHeader = request.headers.get("authorization");
		const adminUserId = await verifyAdmin(authHeader);

		if (!adminUserId) {
			return NextResponse.json(
				{ error: "Unauthorized. Admin access required." },
				{ status: 401, headers: NO_STORE_HEADERS },
			);
		}

		const adminClient = createAdminClient();
		const snapshots = await ensureMissionSnapshotsFresh({ adminClient });

		return NextResponse.json({ snapshots }, { headers: NO_STORE_HEADERS });
	} catch (error) {
		console.error("Unexpected error in GET /api/admin/missions:", error);
		return NextResponse.json(
			{ error: "Failed to load missions" },
			{ status: 500, headers: NO_STORE_HEADERS },
		);
	}
}

export async function POST(request: NextRequest) {
	try {
		const authHeader = request.headers.get("authorization");
		const adminUserId = await verifyAdmin(authHeader);

		if (!adminUserId) {
			return NextResponse.json(
				{ error: "Unauthorized. Admin access required." },
				{ status: 401, headers: NO_STORE_HEADERS },
			);
		}

		const adminClient = createAdminClient();
		const snapshots = await generateAndStoreMissionSnapshots({
			adminClient,
			generatedBy: adminUserId,
			reason: "manual",
		});

		return NextResponse.json({ snapshots }, { headers: NO_STORE_HEADERS });
	} catch (error) {
		console.error("Unexpected error in POST /api/admin/missions:", error);
		return NextResponse.json(
			{ error: "Failed to regenerate missions" },
			{ status: 500, headers: NO_STORE_HEADERS },
		);
	}
}
