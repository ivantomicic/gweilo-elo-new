import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { dispatchNotificationSafely } from "@/lib/notifications/service";
import { notificationCategories } from "@/lib/notifications/types";
import { verifyAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const audienceSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("all") }),
	z.object({
		type: z.literal("session"),
		sessionId: z.string().uuid(),
	}),
	z.object({
		type: z.literal("users"),
		userIds: z.array(z.string().uuid()).min(1).max(500),
	}),
]);

const messageSchema = z.object({
	title: z.string().trim().min(1).max(100),
	body: z.string().trim().min(1).max(500),
	category: z.enum(notificationCategories).default("announcements"),
	audience: audienceSchema,
	data: z
		.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
		.optional(),
});

export async function POST(request: NextRequest) {
	const adminUserId = await verifyAdmin(
		request.headers.get("authorization"),
	);
	if (!adminUserId) {
		return NextResponse.json(
			{ error: "Admin access required." },
			{ status: 403 },
		);
	}

	const parsed = messageSchema.safeParse(await request.json());
	if (!parsed.success) {
		return NextResponse.json(
			{
				error: "Invalid notification.",
				detail: parsed.error.issues[0]?.message,
			},
			{ status: 400 },
		);
	}

	const message = parsed.data;
	const result = await dispatchNotificationSafely({
		eventType: "manual_notification",
		category: message.category,
		title: message.title,
		body: message.body,
		audience: message.audience,
		data: message.data,
		createdBy: adminUserId,
	});

	return NextResponse.json({ result });
}

