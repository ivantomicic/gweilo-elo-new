import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, verifyUser } from "@/lib/supabase/admin";
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
		const authResult = await verifyUser(authHeader);

		if (!authResult) {
			return NextResponse.json(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401, headers: NO_STORE_HEADERS },
			);
		}

		const adminClient = createAdminClient();
		let snapshots = await ensureMissionSnapshotsFresh({ adminClient });
		let snapshot =
			snapshots.find((item) => item.playerId === authResult.userId) || null;

		if (!snapshot) {
			snapshots = await generateAndStoreMissionSnapshots({
				adminClient,
				generatedBy: authResult.userId,
				reason: "on_demand",
			});
			snapshot =
				snapshots.find((item) => item.playerId === authResult.userId) || null;
		}

		return NextResponse.json({ snapshot }, { headers: NO_STORE_HEADERS });
	} catch (error) {
		console.error("Unexpected error in GET /api/missions:", error);
		return NextResponse.json(
			{ error: "Failed to load missions" },
			{ status: 500, headers: NO_STORE_HEADERS },
		);
	}
}
