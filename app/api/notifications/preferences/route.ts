import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
	defaultNotificationPreferences,
	type NotificationPreferences,
} from "@/lib/notifications/types";
import { createAdminClient, verifyUser } from "@/lib/supabase/admin";

const updateSchema = z
	.object({
		enabled: z.boolean().optional(),
		sessionsEnabled: z.boolean().optional(),
		roundsEnabled: z.boolean().optional(),
		resultsEnabled: z.boolean().optional(),
		pollsEnabled: z.boolean().optional(),
		announcementsEnabled: z.boolean().optional(),
	})
	.strict();

type PreferenceRecord = {
	enabled: boolean;
	sessions_enabled: boolean;
	rounds_enabled: boolean;
	results_enabled: boolean;
	polls_enabled: boolean;
	announcements_enabled: boolean;
};

function serializePreferences(
	record: PreferenceRecord | null,
): NotificationPreferences {
	if (!record) return defaultNotificationPreferences;
	return {
		enabled: record.enabled,
		sessionsEnabled: record.sessions_enabled,
		roundsEnabled: record.rounds_enabled,
		resultsEnabled: record.results_enabled,
		pollsEnabled: record.polls_enabled,
		announcementsEnabled: record.announcements_enabled,
	};
}

export async function GET(request: NextRequest) {
	const auth = await verifyUser(request.headers.get("authorization"));
	if (!auth) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { data, error } = await createAdminClient()
		.from("notification_preferences")
		.select(
			"enabled, sessions_enabled, rounds_enabled, results_enabled, polls_enabled, announcements_enabled",
		)
		.eq("user_id", auth.userId)
		.maybeSingle();
	if (error) {
		console.error("Failed to load notification preferences:", error);
		return NextResponse.json(
			{ error: "Could not load notification preferences." },
			{ status: 500 },
		);
	}

	return NextResponse.json({
		preferences: serializePreferences(data as PreferenceRecord | null),
	});
}

export async function PATCH(request: NextRequest) {
	const auth = await verifyUser(request.headers.get("authorization"));
	if (!auth) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const parsed = updateSchema.safeParse(await request.json());
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "Invalid notification preferences." },
			{ status: 400 },
		);
	}

	const updates = parsed.data;
	const admin = createAdminClient();
	const { data: current, error: currentError } = await admin
		.from("notification_preferences")
		.select(
			"enabled, sessions_enabled, rounds_enabled, results_enabled, polls_enabled, announcements_enabled",
		)
		.eq("user_id", auth.userId)
		.maybeSingle();
	if (currentError) {
		return NextResponse.json(
			{ error: "Could not update notification preferences." },
			{ status: 500 },
		);
	}

	const next = {
		...defaultNotificationPreferences,
		...serializePreferences(current as PreferenceRecord | null),
		...updates,
	};
	const { data, error } = await admin
		.from("notification_preferences")
		.upsert(
			{
				user_id: auth.userId,
				enabled: next.enabled,
				sessions_enabled: next.sessionsEnabled,
				rounds_enabled: next.roundsEnabled,
				results_enabled: next.resultsEnabled,
				polls_enabled: next.pollsEnabled,
				announcements_enabled: next.announcementsEnabled,
				updated_at: new Date().toISOString(),
			},
			{ onConflict: "user_id" },
		)
		.select(
			"enabled, sessions_enabled, rounds_enabled, results_enabled, polls_enabled, announcements_enabled",
		)
		.single();
	if (error) {
		console.error("Failed to update notification preferences:", error);
		return NextResponse.json(
			{ error: "Could not update notification preferences." },
			{ status: 500 },
		);
	}

	return NextResponse.json({
		preferences: serializePreferences(data as PreferenceRecord),
	});
}

