import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

function jsonNoStore(body: unknown, status: number) {
	return NextResponse.json(body, {
		status,
		headers: {
			"Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
		},
	});
}

function secretsMatch(provided: string, expected: string) {
	const providedBuffer = Buffer.from(provided);
	const expectedBuffer = Buffer.from(expected);

	return (
		providedBuffer.length === expectedBuffer.length &&
		timingSafeEqual(providedBuffer, expectedBuffer)
	);
}

export function authorizeGptStatsRequest(
	request: NextRequest,
): NextResponse | null {
	const expectedApiKey = process.env.GPT_STATS_API_KEY;

	if (!expectedApiKey) {
		console.error("GPT_STATS_API_KEY is not configured");
		return jsonNoStore(
			{ error: "The GPT statistics API is not configured." },
			503,
		);
	}

	const authorization = request.headers.get("authorization")?.trim() || "";
	const providedApiKey = authorization.toLowerCase().startsWith("bearer ")
		? authorization.slice(7).trim()
		: "";

	if (!providedApiKey || !secretsMatch(providedApiKey, expectedApiKey)) {
		return jsonNoStore({ error: "Unauthorized." }, 401);
	}

	return null;
}

export function gptStatsJson(body: unknown, status = 200) {
	return jsonNoStore(body, status);
}
