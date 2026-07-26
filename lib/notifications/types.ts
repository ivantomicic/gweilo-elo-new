export const notificationCategories = [
	"sessions",
	"rounds",
	"results",
	"polls",
	"announcements",
] as const;

export type NotificationCategory = (typeof notificationCategories)[number];

export type NotificationAudience =
	| { type: "all" }
	| { type: "session"; sessionId: string }
	| { type: "users"; userIds: string[] };

export type NotificationMessage = {
	eventType: string;
	category: NotificationCategory;
	title: string;
	body: string;
	audience: NotificationAudience;
	data?: Record<string, string | number | boolean | null>;
	dedupeKey?: string;
	createdBy?: string;
	collapseId?: string;
	bypassCategoryPreference?: boolean;
};

export type NotificationPreferences = {
	enabled: boolean;
	liveActivitiesEnabled: boolean;
	sessionsEnabled: boolean;
	roundsEnabled: boolean;
	resultsEnabled: boolean;
	pollsEnabled: boolean;
	announcementsEnabled: boolean;
};

export const defaultNotificationPreferences: NotificationPreferences = {
	enabled: true,
	liveActivitiesEnabled: true,
	sessionsEnabled: true,
	roundsEnabled: true,
	resultsEnabled: true,
	pollsEnabled: true,
	announcementsEnabled: true,
};

export function preferenceAllowsCategory(
	preferences: NotificationPreferences,
	category: NotificationCategory,
) {
	if (!preferences.enabled) return false;

	switch (category) {
		case "sessions":
			return preferences.sessionsEnabled;
		case "rounds":
			return preferences.roundsEnabled;
		case "results":
			return preferences.resultsEnabled;
		case "polls":
			return preferences.pollsEnabled;
		case "announcements":
			return preferences.announcementsEnabled;
	}
}
