import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagedRoleFromAuthUser } from "@/lib/auth/roles";
import { getAuthToken } from "../../_utils/auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function createUserScopedClient(accessToken: string) {
	if (!supabaseUrl || !supabaseAnonKey) {
		throw new Error("Missing Supabase public environment variables");
	}

	return createClient(supabaseUrl, supabaseAnonKey, {
		global: {
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		},
		auth: {
			autoRefreshToken: false,
			persistSession: false,
			detectSessionInUrl: false,
		},
	});
}

async function resolveAuthenticatedUser(request: NextRequest) {
	const accessToken = getAuthToken(request);

	if (!accessToken) {
		return {
			accessToken: null,
			user: null,
			errorResponse: NextResponse.json(
				{ error: "Missing auth token" },
				{ status: 401 },
			),
		};
	}

	const adminClient = createAdminClient();
	const { data, error } = await adminClient.auth.getUser(accessToken);

	if (error || !data?.user) {
		return {
			accessToken,
			user: null,
			errorResponse: NextResponse.json(
				{ error: "Invalid or expired token" },
				{ status: 401 },
			),
		};
	}

	return {
		accessToken,
		user: data.user,
		adminClient,
		errorResponse: null,
	};
}

export async function GET(request: NextRequest) {
	const auth = await resolveAuthenticatedUser(request);
	if (auth.errorResponse || !auth.user || !auth.adminClient) {
		return auth.errorResponse as NextResponse;
	}

	const [{ data: recentEvents, error: recentEventsError }, { count, error: countError }] =
		await Promise.all([
			auth.adminClient
				.from("analytics_events")
				.select("id, user_id, event_name, page, created_at")
				.eq("user_id", auth.user.id)
				.order("created_at", { ascending: false })
				.limit(20),
			auth.adminClient
				.from("analytics_events")
				.select("id", { count: "exact", head: true })
				.eq("user_id", auth.user.id),
		]);

	if (recentEventsError || countError) {
		return NextResponse.json(
			{
				error: "Failed to fetch analytics debug data",
				details: recentEventsError || countError,
			},
			{ status: 500 },
		);
	}

	return NextResponse.json({
		user: {
			id: auth.user.id,
			email: auth.user.email,
			role: getManagedRoleFromAuthUser(auth.user),
		},
		analytics: {
			count: count || 0,
			recentEvents: recentEvents || [],
		},
	});
}

export async function POST(request: NextRequest) {
	const auth = await resolveAuthenticatedUser(request);
	if (auth.errorResponse || !auth.user || !auth.adminClient || !auth.accessToken) {
		return auth.errorResponse as NextResponse;
	}

	let payload: { eventName?: string; page?: string } = {};
	try {
		payload = await request.json();
	} catch {
		payload = {};
	}

	const eventName =
		typeof payload.eventName === "string" && payload.eventName.trim().length > 0
			? payload.eventName.trim()
			: "debug_analytics_ping";
	const page =
		typeof payload.page === "string" && payload.page.trim().length > 0
			? payload.page.trim()
			: "/debug/analytics";
	const createdAt = new Date().toISOString();
	const userClient = createUserScopedClient(auth.accessToken);

	const { error: insertError } = await userClient
		.from("analytics_events")
		.insert({
			user_id: auth.user.id,
			event_name: eventName,
			page,
			created_at: createdAt,
		});

	if (insertError) {
		return NextResponse.json(
			{
				ok: false,
				error: insertError.message,
				details: insertError,
				user: {
					id: auth.user.id,
					email: auth.user.email,
					role: getManagedRoleFromAuthUser(auth.user),
				},
			},
			{ status: 500 },
		);
	}

	const { data: insertedEvents, error: fetchError } = await auth.adminClient
		.from("analytics_events")
		.select("id, user_id, event_name, page, created_at")
		.eq("user_id", auth.user.id)
		.eq("event_name", eventName)
		.gte("created_at", createdAt)
		.order("created_at", { ascending: false })
		.limit(5);

	return NextResponse.json({
		ok: true,
		user: {
			id: auth.user.id,
			email: auth.user.email,
			role: getManagedRoleFromAuthUser(auth.user),
		},
		insertedAt: createdAt,
		insertedEvents: fetchError ? [] : insertedEvents || [],
		fetchError: fetchError?.message || null,
	});
}
