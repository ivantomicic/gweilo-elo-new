import { NextRequest } from "next/server";
import {
	authorizeGptStatsRequest,
	gptStatsJson,
} from "@/lib/gpt-stats/auth";
import { getPlayerRivalries, GptStatsError } from "@/lib/gpt-stats/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	const unauthorized = authorizeGptStatsRequest(request);
	if (unauthorized) return unauthorized;

	try {
		const name = request.nextUrl.searchParams.get("name")?.trim() || "";
		const requestedLimit = Number(
			request.nextUrl.searchParams.get("limit") || "10",
		);

		if (!name || name.length > 100) {
			return gptStatsJson(
				{ error: "A player name between 1 and 100 characters is required." },
				400,
			);
		}
		if (
			!Number.isInteger(requestedLimit) ||
			requestedLimit < 1 ||
			requestedLimit > 30
		) {
			return gptStatsJson({ error: "limit must be between 1 and 30." }, 400);
		}

		const data = await getPlayerRivalries(name, requestedLimit);
		return gptStatsJson({
			generated_at: new Date().toISOString(),
			...data,
		});
	} catch (error) {
		console.error("Unexpected error in GET /api/gpt/rivalries:", error);
		if (error instanceof GptStatsError) {
			return gptStatsJson(
				{ error: error.message, details: error.details },
				error.status,
			);
		}
		return gptStatsJson({ error: "Internal server error." }, 500);
	}
}
