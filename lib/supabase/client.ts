import { createClient, type Session } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function getSessionSafely(): Promise<Session | null> {
	try {
		const {
			data: { session },
			error,
		} = await supabase.auth.getSession();

		if (error) {
			console.error("Failed to restore Supabase session:", error);
			return null;
		}

		return session ?? null;
	} catch (error) {
		console.error("Failed to restore Supabase session:", error);
		return null;
	}
}
