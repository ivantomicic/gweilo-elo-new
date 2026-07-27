import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
	sendAPNsNotification,
	type APNsDevice,
	type APNsEnvironment,
} from "./apns";
import {
	defaultNotificationPreferences,
	filterAudienceUserIds,
	preferenceAllowsCategory,
	type NotificationAudience,
	type NotificationCategory,
	type NotificationMessage,
	type NotificationPreferences,
} from "./types";

type DeviceRecord = {
	id: string;
	user_id: string;
	token: string;
	environment: APNsEnvironment;
};

type PreferenceRecord = {
	user_id: string;
	enabled: boolean;
	live_activities_enabled: boolean;
	sessions_enabled: boolean;
	rounds_enabled: boolean;
	results_enabled: boolean;
	polls_enabled: boolean;
	announcements_enabled: boolean;
};

type ExistingEvent = {
	id: string;
	status: string;
	recipient_count: number;
	sent_count: number;
	failed_count: number;
};

export type NotificationDispatchResult = {
	eventId?: string;
	status:
		| "sent"
		| "partial"
		| "failed"
		| "no_recipients"
		| "configuration_required"
		| "duplicate"
		| "unavailable";
	recipients: number;
	sent: number;
	failed: number;
};

function preferencesFromRecord(
	record: PreferenceRecord | undefined,
): NotificationPreferences {
	if (!record) return defaultNotificationPreferences;
	return {
		enabled: record.enabled,
		liveActivitiesEnabled: record.live_activities_enabled,
		sessionsEnabled: record.sessions_enabled,
		roundsEnabled: record.rounds_enabled,
		resultsEnabled: record.results_enabled,
		pollsEnabled: record.polls_enabled,
		announcementsEnabled: record.announcements_enabled,
	};
}

async function resolveAudience(
	admin: SupabaseClient,
	audience: NotificationAudience,
): Promise<string[]> {
	switch (audience.type) {
		case "all": {
			const { data, error } = await admin
				.from("notification_devices")
				.select("user_id")
				.eq("enabled", true)
				.is("invalidated_at", null);
			if (error) throw error;
			return Array.from(
				new Set((data || []).map((device) => device.user_id)),
			);
		}
		case "session": {
			const { data, error } = await admin
				.from("session_players")
				.select("player_id")
				.eq("session_id", audience.sessionId);
			if (error) throw error;
			return filterAudienceUserIds(
				(data || []).map((player) => player.player_id),
				audience.excludeUserIds,
			);
		}
		case "users":
			return Array.from(new Set(audience.userIds));
	}
}

async function loadEligibleDevices(
	admin: SupabaseClient,
	userIds: string[],
	category: NotificationCategory,
	bypassCategoryPreference = false,
) {
	if (userIds.length === 0) return [] as DeviceRecord[];
	const [{ data: preferences, error: preferenceError }, { data: devices, error: deviceError }] =
		await Promise.all([
			admin
				.from("notification_preferences")
				.select(
					"user_id, enabled, live_activities_enabled, sessions_enabled, rounds_enabled, results_enabled, polls_enabled, announcements_enabled",
				)
				.in("user_id", userIds),
			admin
				.from("notification_devices")
				.select("id, user_id, token, environment")
				.in("user_id", userIds)
				.eq("enabled", true)
				.is("invalidated_at", null),
		]);

	if (preferenceError) throw preferenceError;
	if (deviceError) throw deviceError;

	const preferencesByUserId = new Map(
		((preferences || []) as PreferenceRecord[]).map((preference) => [
			preference.user_id,
			preference,
		]),
	);
	return ((devices || []) as DeviceRecord[]).filter((device) => {
		const preference = preferencesFromRecord(
			preferencesByUserId.get(device.user_id),
		);
		return bypassCategoryPreference
			? preference.enabled
			: preferenceAllowsCategory(preference, category);
	});
}

function audiencePayload(audience: NotificationAudience) {
	switch (audience.type) {
		case "all":
			return {};
		case "session":
			return {
				sessionId: audience.sessionId,
				...(audience.excludeUserIds?.length
					? { excludeUserIds: audience.excludeUserIds }
					: {}),
			};
		case "users":
			return { userIds: audience.userIds };
	}
}

async function createEvent(
	admin: SupabaseClient,
	message: NotificationMessage,
): Promise<
	| { kind: "created"; eventId: string }
	| { kind: "existing"; existing: ExistingEvent }
> {
	const findExisting = async () => {
		if (!message.dedupeKey) return null;
		const { data, error } = await admin
			.from("notification_events")
			.select("id, status, recipient_count, sent_count, failed_count")
			.eq("dedupe_key", message.dedupeKey)
			.maybeSingle();
		if (error) throw error;
		return data as ExistingEvent | null;
	};

	if (message.dedupeKey) {
		const existing = await findExisting();
		if (existing) return { kind: "existing", existing };
	}

	const { data, error } = await admin
		.from("notification_events")
		.insert({
			event_type: message.eventType,
			category: message.category,
			title: message.title,
			body: message.body,
			audience_type: message.audience.type,
			audience: audiencePayload(message.audience),
			data: message.data || {},
			dedupe_key: message.dedupeKey || null,
			created_by: message.createdBy || null,
			status: "processing",
		})
		.select("id")
		.single();
	if (error) {
		if (message.dedupeKey && error.code === "23505") {
			const existing = await findExisting();
			if (existing) return { kind: "existing", existing };
		}
		throw error;
	}
	return { kind: "created", eventId: data.id as string };
}

function makePayload(eventId: string, message: NotificationMessage) {
	return {
		aps: {
			alert: {
				title: message.title,
				body: message.body,
			},
			sound: "default" as const,
			"thread-id":
				message.audience.type === "session"
					? `session-${message.audience.sessionId}`
					: message.category,
		},
		notificationId: eventId,
		eventType: message.eventType,
		category: message.category,
		...(message.data || {}),
	};
}

export async function dispatchNotification(
	message: NotificationMessage,
): Promise<NotificationDispatchResult> {
	const admin = createAdminClient();
	const created = await createEvent(admin, message);
	if (created.kind === "existing") {
		return {
			eventId: created.existing.id,
			status: "duplicate",
			recipients: created.existing.recipient_count || 0,
			sent: created.existing.sent_count || 0,
			failed: created.existing.failed_count || 0,
		};
	}

	const eventId = created.eventId;
	const userIds = await resolveAudience(admin, message.audience);
	const devices = await loadEligibleDevices(
		admin,
		userIds,
		message.category,
		message.bypassCategoryPreference,
	);

	if (devices.length === 0) {
		await admin
			.from("notification_events")
			.update({
				status: "no_recipients",
				recipient_count: 0,
				dispatched_at: new Date().toISOString(),
			})
			.eq("id", eventId);
		return {
			eventId,
			status: "no_recipients",
			recipients: 0,
			sent: 0,
			failed: 0,
		};
	}

	const deliveryRows = devices.map((device) => ({
		event_id: eventId,
		user_id: device.user_id,
		device_id: device.id,
		status: "pending",
	}));
	const { error: deliveryError } = await admin
		.from("notification_deliveries")
		.insert(deliveryRows);
	if (deliveryError) throw deliveryError;

	const apnsDevices: APNsDevice[] = devices.map((device) => ({
		id: device.id,
		token: device.token,
		environment: device.environment,
	}));
	const results = await sendAPNsNotification({
		devices: apnsDevices,
		payload: makePayload(eventId, message),
		collapseId: message.collapseId,
	});
	const resultByDeviceId = new Map(
		results.map((result) => [result.deviceId, result]),
	);

	await Promise.all(
		devices.map(async (device) => {
			const result = resultByDeviceId.get(device.id);
			if (!result) return;
				await admin
					.from("notification_deliveries")
					.update({
						status: result.configurationRequired
							? "skipped"
							: result.succeeded
								? "sent"
								: "failed",
					apns_id: result.apnsId,
					apns_status: result.status || null,
					failure_reason: result.reason || null,
					sent_at: result.succeeded
						? new Date().toISOString()
						: null,
				})
				.eq("event_id", eventId)
				.eq("device_id", device.id);

			if (result.shouldInvalidateToken) {
				await admin
					.from("notification_devices")
					.update({
						enabled: false,
						invalidated_at: new Date().toISOString(),
						failure_reason: result.reason || "Invalid APNs token",
						updated_at: new Date().toISOString(),
					})
					.eq("id", device.id);
			}
		}),
	);

	const sent = results.filter((result) => result.succeeded).length;
	const configurationRequired = results.filter(
		(result) => result.configurationRequired,
	).length;
	const failed = results.filter(
		(result) => !result.succeeded && !result.configurationRequired,
	).length;
	const status =
		sent === results.length
			? "sent"
			: configurationRequired === results.length
				? "configuration_required"
				: sent > 0
					? "partial"
					: "failed";
	await admin
		.from("notification_events")
		.update({
			status,
			recipient_count: devices.length,
			sent_count: sent,
			failed_count: failed,
			dispatched_at: new Date().toISOString(),
		})
		.eq("id", eventId);

	return {
		eventId,
		status,
		recipients: devices.length,
		sent,
		failed,
	};
}

export async function dispatchNotificationSafely(
	message: NotificationMessage,
): Promise<NotificationDispatchResult> {
	try {
		return await dispatchNotification(message);
	} catch (error) {
		console.error(
			`Notification dispatch failed for ${message.eventType}:`,
			error,
		);
		return {
			status: "unavailable",
			recipients: 0,
			sent: 0,
			failed: 0,
		};
	}
}
