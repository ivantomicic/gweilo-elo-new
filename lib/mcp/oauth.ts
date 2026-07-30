export const MCP_OAUTH_SCOPES = ["openid", "email", "profile"] as const;

export const MCP_TOOL_SECURITY_SCHEMES = [
	{
		type: "oauth2",
		scopes: [...MCP_OAUTH_SCOPES],
	},
] as const;

function withoutTrailingSlash(value: string) {
	return value.replace(/\/+$/, "");
}

export function getMcpResourceUrl(origin: string) {
	return `${withoutTrailingSlash(origin)}/api/mcp`;
}

export function getMcpResourceMetadataUrl(origin: string) {
	return `${withoutTrailingSlash(origin)}/.well-known/oauth-protected-resource`;
}

export function getSupabaseAuthorizationServerUrl() {
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	if (!supabaseUrl) {
		throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for MCP OAuth.");
	}

	return `${withoutTrailingSlash(supabaseUrl)}/auth/v1`;
}

export function getMcpBearerChallenge(origin: string) {
	const resourceMetadataUrl = getMcpResourceMetadataUrl(origin);
	const scopes = MCP_OAUTH_SCOPES.join(" ");

	return `Bearer resource_metadata="${resourceMetadataUrl}", scope="${scopes}"`;
}
