import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient, verifyUser } from "@/lib/supabase/admin";

const deviceSchema = z.object({
	token: z.string().trim().min(1).max(512),
	environment: z.enum(["development", "production"]),
	platform: z.literal("ios").default("ios"),
	bundleId: z.string().trim().min(1).max(255),
	appVersion: z.string().trim().max(64).optional(),
});

const deleteSchema = z.object({
	token: z.string().trim().min(1).max(512),
	environment: z.enum(["development", "production"]),
	bundleId: z.string().trim().min(1).max(255),
});

export async function POST(request: NextRequest) {
	const auth = await verifyUser(request.headers.get("authorization"));
	if (!auth) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const parsed = deviceSchema.safeParse(await request.json());
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid push notification device." },
			{ status: 400 },
		);
	}

	const device = parsed.data;
	const { data, error } = await createAdminClient()
		.from("notification_devices")
		.upsert(
			{
				user_id: auth.userId,
				token: device.token,
				platform: device.platform,
				environment: device.environment,
				bundle_id: device.bundleId,
				app_version: device.appVersion || null,
				enabled: true,
				last_seen_at: new Date().toISOString(),
				invalidated_at: null,
				failure_reason: null,
				updated_at: new Date().toISOString(),
			},
			{
				onConflict: "token,environment,bundle_id",
			},
		)
		.select("id")
		.single();
	if (error) {
		console.error("Failed to register notification device:", error);
		return NextResponse.json(
			{ error: "Could not register this iPhone for notifications." },
			{ status: 500 },
		);
	}

	return NextResponse.json({ registered: true, deviceId: data.id });
}

export async function DELETE(request: NextRequest) {
	const auth = await verifyUser(request.headers.get("authorization"));
	if (!auth) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const parsed = deleteSchema.safeParse(await request.json());
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid push notification device." },
			{ status: 400 },
		);
	}

	const device = parsed.data;
	const { error } = await createAdminClient()
		.from("notification_devices")
		.delete()
		.eq("user_id", auth.userId)
		.eq("token", device.token)
		.eq("environment", device.environment)
		.eq("bundle_id", device.bundleId);
	if (error) {
		console.error("Failed to unregister notification device:", error);
		return NextResponse.json(
			{ error: "Could not unregister this iPhone." },
			{ status: 500 },
		);
	}

	return NextResponse.json({ registered: false });
}

