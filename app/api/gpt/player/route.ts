import { NextRequest } from "next/server";
import {
	authorizeGptStatsRequest,
	gptStatsJson,
} from "@/lib/gpt-stats/auth";
import { getPlayerSummary, GptStatsError } from "@/lib/gpt-stats/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	const unauthorized = authorizeGptStatsRequest(request);
	if (unauthorized) return unauthorized;

	try {
		const name = request.nextUrl.searchParams.get("name")?.trim() || "";
		if (!name || name.length > 100) {
			return gptStatsJson(
				{ error: "A player name between 1 and 100 characters is required." },
				400,
			);
		}

		const data = await getPlayerSummary(name);
		return gptStatsJson({
			generated_at: new Date().toISOString(),
			...data,
		});
	} catch (error) {
		console.error("Unexpected error in GET /api/gpt/player:", error);
		if (error instanceof GptStatsError) {
			return gptStatsJson(
				{ error: error.message, details: error.details },
				error.status,
			);
		}
		return gptStatsJson({ error: "Internal server error." }, 500);
	}
}
