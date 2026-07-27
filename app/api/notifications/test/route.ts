import { NextRequest, NextResponse } from "next/server";
import { dispatchNotificationSafely } from "@/lib/notifications/service";
import { verifyUser } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
	const auth = await verifyUser(request.headers.get("authorization"));
	if (!auth) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const result = await dispatchNotificationSafely({
		eventType: "test_notification",
		category: "announcements",
		title: "Gweilo obaveštenja rade",
		body: "Ovaj iPhone je spreman za obaveštenja o sesijama i Elo promenama.",
		audience: { type: "users", userIds: [auth.userId] },
		data: { route: "home" },
		createdBy: auth.userId,
		bypassCategoryPreference: true,
	});

	return NextResponse.json({ result });
}
