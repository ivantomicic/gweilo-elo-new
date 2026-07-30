import assert from "node:assert/strict";
import test from "node:test";
import { getSafeNextPath } from "../../lib/auth/safe-next-path";
import {
	getMcpBearerChallenge,
	getMcpResourceMetadataUrl,
	getMcpResourceUrl,
} from "../../lib/mcp/oauth";

test("builds MCP OAuth URLs from the public origin", () => {
	assert.equal(
		getMcpResourceUrl("https://www.gweilo.lol/"),
		"https://www.gweilo.lol/api/mcp",
	);
	assert.equal(
		getMcpResourceMetadataUrl("https://www.gweilo.lol"),
		"https://www.gweilo.lol/.well-known/oauth-protected-resource",
	);
	assert.equal(
		getMcpBearerChallenge("https://www.gweilo.lol"),
		'Bearer resource_metadata="https://www.gweilo.lol/.well-known/oauth-protected-resource", scope="openid email profile"',
	);
});

test("allows same-origin callback paths", () => {
	assert.equal(
		getSafeNextPath("/oauth/consent?authorization_id=request-123"),
		"/oauth/consent?authorization_id=request-123",
	);
});

test("rejects callback values that could redirect off-site", () => {
	assert.equal(getSafeNextPath("https://evil.example"), "/");
	assert.equal(getSafeNextPath("//evil.example/path"), "/");
	assert.equal(getSafeNextPath("/\\evil.example/path"), "/");
	assert.equal(getSafeNextPath(null), "/");
});
