import { createClient, type Session } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SESSION_TIMEOUT_MS = 3000;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

function clearStorageKeys(storage: Storage | undefined) {
	if (!storage) {
		return;
	}

	const keysToRemove: string[] = [];

	for (let index = 0; index < storage.length; index += 1) {
		const key = storage.key(index);
		if (key && /^sb-.*-(auth-token|code-verifier)$/.test(key)) {
			keysToRemove.push(key);
		}
	}

	keysToRemove.forEach((key) => storage.removeItem(key));
}

export function clearPersistedSupabaseAuthState() {
	if (typeof window === "undefined") {
		return;
	}

	clearStorageKeys(window.localStorage);
	clearStorageKeys(window.sessionStorage);
}

function createSessionTimeout(): Promise<never> {
	return new Promise((_, reject) => {
		window.setTimeout(() => {
			reject(new Error("Timed out while restoring Supabase session"));
		}, SESSION_TIMEOUT_MS);
	});
}

export async function getSessionSafely(): Promise<Session | null> {
	try {
		const {
			data: { session },
		} = await Promise.race([supabase.auth.getSession(), createSessionTimeout()]);

		return session ?? null;
	} catch (error) {
		console.error("Failed to restore Supabase session:", error);
		clearPersistedSupabaseAuthState();
		return null;
	}
}
