import { NextRequest, NextResponse } from "next/server";
import {
	getMcpResourceUrl,
	getSupabaseAuthorizationServerUrl,
	MCP_OAUTH_SCOPES,
} from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
	return NextResponse.json(
		{
			resource: getMcpResourceUrl(request.nextUrl.origin),
			authorization_servers: [getSupabaseAuthorizationServerUrl()],
			scopes_supported: [...MCP_OAUTH_SCOPES],
			bearer_methods_supported: ["header"],
		},
		{
			headers: {
				"Cache-Control": "public, max-age=300",
			},
		},
	);
}
