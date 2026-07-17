import { NextRequest } from "next/server";
import {
	authorizeGptStatsRequest,
	gptStatsJson,
} from "@/lib/gpt-stats/auth";
import { getEloRules } from "@/lib/gpt-stats/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	const unauthorized = authorizeGptStatsRequest(request);
	if (unauthorized) return unauthorized;

	return gptStatsJson(getEloRules());
}
