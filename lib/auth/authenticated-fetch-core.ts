type AccessTokenSession = {
	access_token: string;
};

type SessionResult = {
	data: {
		session: AccessTokenSession | null;
	};
	error: unknown;
};

export type SessionAuthClient = {
	getSession: () => Promise<SessionResult>;
	refreshSession: () => Promise<SessionResult>;
};

export class AuthSessionUnavailableError extends Error {
	constructor(message = "No authenticated session is available.") {
		super(message);
		this.name = "AuthSessionUnavailableError";
	}
}

function inputForAttempt(input: RequestInfo | URL): RequestInfo | URL {
	return input instanceof Request ? input.clone() : input;
}

function initWithAccessToken(
	init: RequestInit | undefined,
	accessToken: string,
): RequestInit {
	const headers = new Headers(init?.headers);
	headers.set("Authorization", `Bearer ${accessToken}`);

	return {
		...init,
		headers,
	};
}

/**
 * Creates a fetch function that always reads the latest Supabase session.
 * A 401 is retried once after an explicit token rotation, but never signs the
 * user out: Supabase remains the source of truth for terminal session expiry.
 */
export function createAuthenticatedFetch(
	auth: SessionAuthClient,
	fetchImplementation: typeof fetch = fetch,
) {
	return async function authenticatedFetch(
		input: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> {
		const {
			data: { session },
			error: sessionError,
		} = await auth.getSession();

		if (sessionError || !session) {
			throw new AuthSessionUnavailableError();
		}

		const response = await fetchImplementation(
			inputForAttempt(input),
			initWithAccessToken(init, session.access_token),
		);

		if (response.status !== 401) {
			return response;
		}

		const {
			data: { session: refreshedSession },
			error: refreshError,
		} = await auth.refreshSession();

		if (refreshError || !refreshedSession) {
			return response;
		}

		return fetchImplementation(
			inputForAttempt(input),
			initWithAccessToken(init, refreshedSession.access_token),
		);
	};
}
