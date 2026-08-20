import { NextRequest, NextResponse } from "next/server";

const LOCAL_SCOREKEEPER_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function configuredOrigins(): Set<string> {
	return new Set(
		(process.env.SCOREKEEPER_ALLOWED_ORIGINS ?? "")
			.split(",")
			.map((origin) => origin.trim())
			.filter(Boolean),
	);
}

function allowedOrigin(request: NextRequest): string | null {
	const origin = request.headers.get("origin");
	if (!origin) return null;
	if (LOCAL_SCOREKEEPER_ORIGIN.test(origin)) return origin;
	return configuredOrigins().has(origin) ? origin : null;
}

export function scorekeeperResponse(
	request: NextRequest,
	body: unknown,
	init?: ResponseInit,
) {
	const response = NextResponse.json(body, init);
	const origin = allowedOrigin(request);
	if (origin) {
		response.headers.set("Access-Control-Allow-Origin", origin);
		response.headers.set("Vary", "Origin");
	}
	response.headers.set("Cache-Control", "no-store");
	return response;
}

export function scorekeeperOptions(request: NextRequest) {
	const origin = allowedOrigin(request);
	if (!origin) {
		return new NextResponse(null, { status: 403 });
	}

	return new NextResponse(null, {
		status: 204,
		headers: {
			"Access-Control-Allow-Origin": origin,
			"Access-Control-Allow-Headers": "Authorization, Content-Type",
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Max-Age": "86400",
			Vary: "Origin",
		},
	});
}
