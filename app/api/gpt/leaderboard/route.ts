import { NextRequest } from "next/server";
import {
	authorizeGptStatsRequest,
	gptStatsJson,
} from "@/lib/gpt-stats/auth";
import {
	getLeaderboard,
	GptStatsError,
	type RatingMode,
} from "@/lib/gpt-stats/service";

export const dynamic = "force-dynamic";

function parseInteger(
	value: string | null,
	fallback: number,
	minimum: number,
	maximum: number,
) {
	if (value === null) return fallback;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
		? parsed
		: null;
}

export async function GET(request: NextRequest) {
	const unauthorized = authorizeGptStatsRequest(request);
	if (unauthorized) return unauthorized;

	try {
		const { searchParams } = request.nextUrl;
		const mode = searchParams.get("mode") || "singles";
		const limit = parseInteger(searchParams.get("limit"), 20, 1, 50);
		const minimumMatches = searchParams.has("minimum_matches")
			? parseInteger(searchParams.get("minimum_matches"), 0, 0, 1000)
			: undefined;

		if (mode !== "singles" && mode !== "doubles") {
			return gptStatsJson(
				{ error: "mode must be singles or doubles." },
				400,
			);
		}

		if (limit === null || minimumMatches === null) {
			return gptStatsJson(
				{ error: "Invalid limit or minimum_matches value." },
				400,
			);
		}

		const data = await getLeaderboard({
			mode: mode as RatingMode,
			limit,
			minimumMatches,
		});

		return gptStatsJson({
			generated_at: new Date().toISOString(),
			...data,
		});
	} catch (error) {
		console.error("Unexpected error in GET /api/gpt/leaderboard:", error);
		if (error instanceof GptStatsError) {
			return gptStatsJson(
				{ error: error.message, details: error.details },
				error.status,
			);
		}
		return gptStatsJson({ error: "Internal server error." }, 500);
	}
}
