import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient, verifyUser } from "@/lib/supabase/admin";

const tokenSchema = z.object({
	token: z.string().trim().min(16),
	tokenType: z.enum(["push_to_start", "update"]),
	activityId: z.string().trim().min(1).nullable().optional(),
	sessionId: z.string().uuid().nullable().optional(),
	environment: z.enum(["development", "production"]),
	bundleId: z.string().trim().min(3),
	deviceIdentifier: z.string().uuid(),
});

const deleteSchema = z.object({
	tokenType: z.enum(["push_to_start", "update"]).optional(),
	activityId: z.string().trim().min(1).optional(),
	deviceIdentifier: z.string().uuid(),
});

export async function POST(request: NextRequest) {
	const auth = await verifyUser(request.headers.get("authorization"));
	if (!auth) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const parsed = tokenSchema.safeParse(await request.json());
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid Live Activity token." },
			{ status: 400 },
		);
	}

	const input = parsed.data;
	if (input.tokenType === "update" && !input.activityId) {
		return NextResponse.json(
			{ error: "An activityId is required for update tokens." },
			{ status: 400 },
		);
	}

	const admin = createAdminClient();
	if (input.tokenType === "push_to_start") {
		await admin
			.from("live_activity_tokens")
			.update({
				enabled: false,
				invalidated_at: new Date().toISOString(),
				failure_reason: "Replaced by a newer push-to-start token",
			})
			.eq("user_id", auth.userId)
			.eq("device_identifier", input.deviceIdentifier)
			.eq("token_type", "push_to_start")
			.neq("token", input.token);
	}

	const { error } = await admin.from("live_activity_tokens").upsert(
		{
			user_id: auth.userId,
			token: input.token,
			token_type: input.tokenType,
			activity_type: "session",
			activity_id: input.activityId ?? null,
			session_id: input.sessionId ?? null,
			environment: input.environment,
			bundle_id: input.bundleId,
			device_identifier: input.deviceIdentifier,
			enabled: true,
			last_seen_at: new Date().toISOString(),
			invalidated_at: null,
			failure_reason: null,
			updated_at: new Date().toISOString(),
		},
		{ onConflict: "token,environment,bundle_id" },
	);
	if (error) {
		console.error("Failed to register Live Activity token:", error);
		return NextResponse.json(
			{ error: "Could not register Live Activity token." },
			{ status: 500 },
		);
	}

	return NextResponse.json({ registered: true });
}

export async function DELETE(request: NextRequest) {
	const auth = await verifyUser(request.headers.get("authorization"));
	if (!auth) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const parsed = deleteSchema.safeParse(await request.json());
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid Live Activity token request." },
			{ status: 400 },
		);
	}

	let query = createAdminClient()
		.from("live_activity_tokens")
		.delete()
		.eq("user_id", auth.userId)
		.eq("device_identifier", parsed.data.deviceIdentifier);
	if (parsed.data.tokenType) {
		query = query.eq("token_type", parsed.data.tokenType);
	}
	if (parsed.data.activityId) {
		query = query.eq("activity_id", parsed.data.activityId);
	}
	const { error } = await query;
	if (error) {
		return NextResponse.json(
			{ error: "Could not unregister Live Activity token." },
			{ status: 500 },
		);
	}
	return NextResponse.json({ registered: false });
}
