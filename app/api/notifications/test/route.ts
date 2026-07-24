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
		title: "Gweilo notifications work",
		body: "This iPhone is ready for session and Elo updates.",
		audience: { type: "users", userIds: [auth.userId] },
		data: { route: "home" },
		createdBy: auth.userId,
		bypassCategoryPreference: true,
	});

	return NextResponse.json({ result });
}
