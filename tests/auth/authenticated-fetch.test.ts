import assert from "node:assert/strict";
import test from "node:test";
import {
	AuthSessionUnavailableError,
	createAuthenticatedFetch,
	type SessionAuthClient,
} from "../../lib/auth/authenticated-fetch-core";

function sessionResult(accessToken: string | null, error: unknown = null) {
	return {
		data: {
			session: accessToken ? { access_token: accessToken } : null,
		},
		error,
	};
}

test("uses the latest session token instead of a captured React token", async () => {
	const authorizationHeaders: string[] = [];
	const auth: SessionAuthClient = {
		getSession: async () => sessionResult("fresh-token"),
		refreshSession: async () => sessionResult("unused-token"),
	};
	const authenticatedFetch = createAuthenticatedFetch(
		auth,
		async (_input, init) => {
			authorizationHeaders.push(
				new Headers(init?.headers).get("Authorization") ?? "",
			);
			return new Response(null, { status: 200 });
		},
	);

	const response = await authenticatedFetch("https://example.test/api");

	assert.equal(response.status, 200);
	assert.deepEqual(authorizationHeaders, ["Bearer fresh-token"]);
});

test("refreshes and retries once after a 401", async () => {
	const authorizationHeaders: string[] = [];
	let refreshCount = 0;
	const auth: SessionAuthClient = {
		getSession: async () => sessionResult("expired-token"),
		refreshSession: async () => {
			refreshCount += 1;
			return sessionResult("rotated-token");
		},
	};
	const authenticatedFetch = createAuthenticatedFetch(
		auth,
		async (_input, init) => {
			const authorization =
				new Headers(init?.headers).get("Authorization") ?? "";
			authorizationHeaders.push(authorization);
			return new Response(null, {
				status: authorization.includes("expired-token") ? 401 : 200,
			});
		},
	);

	const response = await authenticatedFetch("https://example.test/api");

	assert.equal(response.status, 200);
	assert.equal(refreshCount, 1);
	assert.deepEqual(authorizationHeaders, [
		"Bearer expired-token",
		"Bearer rotated-token",
	]);
});

test("returns the original 401 when refresh fails without forcing logout", async () => {
	let requestCount = 0;
	const auth: SessionAuthClient = {
		getSession: async () => sessionResult("rejected-token"),
		refreshSession: async () => sessionResult(null, new Error("offline")),
	};
	const authenticatedFetch = createAuthenticatedFetch(auth, async () => {
		requestCount += 1;
		return new Response(null, { status: 401 });
	});

	const response = await authenticatedFetch("https://example.test/api");

	assert.equal(response.status, 401);
	assert.equal(requestCount, 1);
});

test("does not send a request when no Supabase session exists", async () => {
	const auth: SessionAuthClient = {
		getSession: async () => sessionResult(null),
		refreshSession: async () => sessionResult(null),
	};
	const authenticatedFetch = createAuthenticatedFetch(auth, async () => {
		throw new Error("fetch should not run");
	});

	await assert.rejects(
		authenticatedFetch("https://example.test/api"),
		AuthSessionUnavailableError,
	);
});
