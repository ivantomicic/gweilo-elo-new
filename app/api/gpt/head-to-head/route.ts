import { NextRequest } from "next/server";
import {
	authorizeGptStatsRequest,
	gptStatsJson,
} from "@/lib/gpt-stats/auth";
import { getHeadToHead, GptStatsError } from "@/lib/gpt-stats/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	const unauthorized = authorizeGptStatsRequest(request);
	if (unauthorized) return unauthorized;

	try {
		const player = request.nextUrl.searchParams.get("player")?.trim() || "";
		const opponent =
			request.nextUrl.searchParams.get("opponent")?.trim() || "";

		if (
			!player ||
			!opponent ||
			player.length > 100 ||
			opponent.length > 100
		) {
			return gptStatsJson(
				{
					error:
						"player and opponent names between 1 and 100 characters are required.",
				},
				400,
			);
		}

		const data = await getHeadToHead(player, opponent);
		return gptStatsJson({
			generated_at: new Date().toISOString(),
			...data,
		});
	} catch (error) {
		console.error("Unexpected error in GET /api/gpt/head-to-head:", error);
		if (error instanceof GptStatsError) {
			return gptStatsJson(
				{ error: error.message, details: error.details },
				error.status,
			);
		}
		return gptStatsJson({ error: "Internal server error." }, 500);
	}
}
