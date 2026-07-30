import { createMcpHandler } from "@modelcontextprotocol/server";
import { NextRequest, NextResponse } from "next/server";
import { createGweiloMcpServer } from "@/lib/mcp/server";
import { getMcpBearerChallenge, MCP_OAUTH_SCOPES } from "@/lib/mcp/oauth";
import { verifyUser } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handler = createMcpHandler(
	(context) => {
		const userId = context.authInfo?.extra?.userId;
		if (typeof userId !== "string" || !userId) {
			throw new Error("Authenticated user context is missing.");
		}

		return createGweiloMcpServer(userId);
	},
	{
		legacy: "stateless",
		onerror: (error) => {
			console.error("Gweilo MCP protocol error:", error);
		},
	},
);

function getBearerToken(request: NextRequest) {
	const authorization = request.headers.get("authorization")?.trim() || "";
	if (!authorization.toLowerCase().startsWith("bearer ")) {
		return null;
	}

	const token = authorization.slice(7).trim();
	return token || null;
}

function unauthorized(request: NextRequest) {
	return NextResponse.json(
		{ error: "A valid Supabase access token is required." },
		{
			status: 401,
			headers: {
				"Cache-Control": "no-store",
				"WWW-Authenticate": getMcpBearerChallenge(
					request.nextUrl.origin,
				),
			},
		},
	);
}

async function handleMcpRequest(request: NextRequest) {
	const token = getBearerToken(request);
	if (!token) {
		return unauthorized(request);
	}

	const authenticatedUser = await verifyUser(`Bearer ${token}`);
	if (!authenticatedUser) {
		return unauthorized(request);
	}

	const response = await handler.fetch(request, {
		authInfo: {
			token,
			clientId: authenticatedUser.userId,
			scopes: [...MCP_OAUTH_SCOPES],
			extra: { userId: authenticatedUser.userId },
		},
	});
	const headers = new Headers(response.headers);
	headers.set("Cache-Control", "no-store, no-cache, max-age=0");

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export async function POST(request: NextRequest) {
	return handleMcpRequest(request);
}

export async function GET(request: NextRequest) {
	return handleMcpRequest(request);
}

export async function DELETE(request: NextRequest) {
	return handleMcpRequest(request);
}
