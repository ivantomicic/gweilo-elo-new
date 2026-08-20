import { NextRequest } from "next/server";
import {
	scorekeeperOptions,
	scorekeeperResponse,
} from "@/lib/scorekeeper/http";

export const dynamic = "force-dynamic";

export function OPTIONS(request: NextRequest) {
	return scorekeeperOptions(request);
}

export function GET(request: NextRequest) {
	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

	if (!supabaseUrl || !supabaseAnonKey) {
		return scorekeeperResponse(
			request,
			{ error: "Scorekeeper authentication is not configured." },
			{ status: 500 },
		);
	}

	return scorekeeperResponse(request, {
		supabaseUrl,
		supabaseAnonKey,
	});
}
