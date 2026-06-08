import { NextRequest, NextResponse } from "next/server";
import { computePlayerRankPlacementTotals } from "@/lib/elo/rank-duration";
import { verifyUser } from "@/lib/supabase/admin";
import { MIN_SINGLES_MATCHES } from "@/lib/statistics/min-matches";

function jsonNoStore(body: unknown, init?: ResponseInit) {
	return NextResponse.json(body, {
		...init,
		headers: {
			"Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
			...init?.headers,
		},
	});
}

export async function GET(
	request: NextRequest,
	{ params }: { params: { playerId: string } }
) {
	try {
		const user = await verifyUser(request.headers.get("authorization"));

		if (!user) {
			return jsonNoStore(
				{ error: "Unauthorized. Authentication required." },
				{ status: 401 }
			);
		}

		const placements = await computePlayerRankPlacementTotals({
			playerId: params.playerId,
			entityType: "player_singles",
			minMatches: MIN_SINGLES_MATCHES,
		});

		return jsonNoStore({ placements });
	} catch (error) {
		console.error(
			"Unexpected error in GET /api/player/[playerId]/rank-placements:",
			error
		);
		return jsonNoStore(
			{ error: "Internal server error" },
			{ status: 500 }
		);
	}
}
