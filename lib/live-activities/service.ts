import type { SupabaseClient } from "@supabase/supabase-js";
import {
	sendAPNsLiveActivity,
	type APNsDevice,
} from "@/lib/notifications/apns";
import { createAdminClient } from "@/lib/supabase/admin";
import {
	makeSessionLiveActivityEndPayload,
	makeSessionLiveActivityStartPayload,
	makeSessionLiveActivityUpdatePayload,
} from "./payload";
import { buildSessionLiveActivitySnapshot } from "./state";
import type {
	LiveActivityEvent,
	LiveActivityTokenRecord,
	SessionLiveActivityState,
} from "./types";

type PreferenceRow = {
	user_id: string;
	enabled: boolean;
	live_activities_enabled: boolean;
};

async function participantIDs(admin: SupabaseClient, sessionID: string) {
	const { data, error } = await admin
		.from("session_players")
		.select("player_id")
		.eq("session_id", sessionID);
	if (error) throw error;
	return Array.from(new Set((data ?? []).map((row) => String(row.player_id))));
}

async function eligibleTokens(
	admin: SupabaseClient,
	sessionID: string,
	tokenType: "push_to_start" | "update",
) {
	const users = await participantIDs(admin, sessionID);
	if (users.length === 0) return [] as LiveActivityTokenRecord[];

	const [{ data: preferenceRows, error: preferenceError }, tokenResponse] =
		await Promise.all([
			admin
				.from("notification_preferences")
				.select("user_id, enabled, live_activities_enabled")
				.in("user_id", users),
			(() => {
				let query = admin
					.from("live_activity_tokens")
					.select(
						"id, user_id, token, token_type, activity_id, session_id, environment, bundle_id, device_identifier",
					)
					.in("user_id", users)
					.eq("token_type", tokenType)
					.eq("enabled", true)
					.is("invalidated_at", null);
				if (tokenType === "update") query = query.eq("session_id", sessionID);
				return query;
			})(),
		]);
	if (preferenceError) throw preferenceError;
	if (tokenResponse.error) throw tokenResponse.error;

	const preferences = new Map(
		((preferenceRows ?? []) as PreferenceRow[]).map((row) => [row.user_id, row]),
	);
	return ((tokenResponse.data ?? []) as LiveActivityTokenRecord[]).filter(
		(token) => {
			const preference = preferences.get(token.user_id);
			return (
				(!preference || preference.enabled) &&
				(!preference || preference.live_activities_enabled)
			);
		},
	);
}

async function dispatch(
	admin: SupabaseClient,
	sessionID: string,
	event: LiveActivityEvent,
	tokens: LiveActivityTokenRecord[],
	payload: Parameters<typeof sendAPNsLiveActivity>[0]["payload"],
) {
	if (tokens.length === 0) return;
	const results = await sendAPNsLiveActivity({
		devices: tokens.map(
			(token): APNsDevice => ({
				id: token.id,
				token: token.token,
				environment: token.environment,
			}),
		),
		payload,
	});
	const resultByToken = new Map(results.map((result) => [result.deviceId, result]));

	await Promise.all(
		tokens.map(async (token) => {
			const result = resultByToken.get(token.id);
			if (!result) return;
			await admin.from("live_activity_deliveries").insert({
				session_id: sessionID,
				user_id: token.user_id,
				token_id: token.id,
				event,
				status: result.configurationRequired
					? "skipped"
					: result.succeeded
						? "sent"
						: "failed",
				apns_id: result.apnsId,
				apns_status: result.status,
				failure_reason: result.reason ?? null,
			});
			if (result.shouldInvalidateToken) {
				await admin
					.from("live_activity_tokens")
					.update({
						enabled: false,
						invalidated_at: new Date().toISOString(),
						failure_reason: result.reason ?? "APNs rejected token",
					})
					.eq("id", token.id);
			}
		}),
	);
}

export async function startSessionLiveActivity(sessionID: string) {
	const admin = createAdminClient();
	const [snapshot, tokens] = await Promise.all([
		buildSessionLiveActivitySnapshot(admin, sessionID),
		eligibleTokens(admin, sessionID, "push_to_start"),
	]);
	await dispatch(
		admin,
		sessionID,
		"start",
		tokens,
		makeSessionLiveActivityStartPayload(snapshot),
	);
}

export async function updateSessionLiveActivity(sessionID: string) {
	const admin = createAdminClient();
	const [snapshot, tokens] = await Promise.all([
		buildSessionLiveActivitySnapshot(admin, sessionID),
		eligibleTokens(admin, sessionID, "update"),
	]);
	await dispatch(
		admin,
		sessionID,
		"update",
		tokens,
		makeSessionLiveActivityUpdatePayload({ state: snapshot.state }),
	);
}

export async function endSessionLiveActivity(
	sessionID: string,
	overrideState?: SessionLiveActivityState,
) {
	const admin = createAdminClient();
	const [snapshot, tokens] = await Promise.all([
		buildSessionLiveActivitySnapshot(admin, sessionID),
		eligibleTokens(admin, sessionID, "update"),
	]);
	const state = overrideState ?? {
		...snapshot.state,
		status: "completed" as const,
		headline: "Sesija je završena",
	};
	await dispatch(
		admin,
		sessionID,
		"end",
		tokens,
		makeSessionLiveActivityEndPayload({ state }),
	);
	await admin
		.from("live_activity_tokens")
		.update({ enabled: false, updated_at: new Date().toISOString() })
		.eq("session_id", sessionID)
		.eq("token_type", "update");
}

export async function prepareSessionLiveActivityCancellation(sessionID: string) {
	const admin = createAdminClient();
	const [snapshot, tokens] = await Promise.all([
		buildSessionLiveActivitySnapshot(admin, sessionID),
		eligibleTokens(admin, sessionID, "update"),
	]);
	return async () => {
		const state: SessionLiveActivityState = {
			...snapshot.state,
			status: "cancelled",
			headline: "Sesija je otkazana",
			matchups: [],
		};
		await dispatch(
			admin,
			sessionID,
			"end",
			tokens,
			makeSessionLiveActivityEndPayload({
				state,
				dismissAfterSeconds: 60,
			}),
		);
	};
}

function safely(label: string, action: () => Promise<void>) {
	return action().catch((error) => {
		console.error(`[LIVE_ACTIVITY] ${label} failed:`, error);
	});
}

export const startSessionLiveActivitySafely = (sessionID: string) =>
	safely("start", () => startSessionLiveActivity(sessionID));
export const updateSessionLiveActivitySafely = (sessionID: string) =>
	safely("update", () => updateSessionLiveActivity(sessionID));
export const endSessionLiveActivitySafely = (sessionID: string) =>
	safely("end", () => endSessionLiveActivity(sessionID));
