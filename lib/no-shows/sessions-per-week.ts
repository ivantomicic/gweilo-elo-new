export const SESSIONS_PER_WEEK_OPTIONS = [1, 2, 3, 4] as const;

export type SessionsPerWeek = (typeof SESSIONS_PER_WEEK_OPTIONS)[number];

export const SESSIONS_PER_WEEK_METADATA_KEY = "sessions_per_week";

export function parseSessionsPerWeek(
	value: unknown,
): SessionsPerWeek | null {
	if (typeof value === "number") {
		return SESSIONS_PER_WEEK_OPTIONS.includes(value as SessionsPerWeek)
			? (value as SessionsPerWeek)
			: null;
	}

	if (typeof value === "string" && value.trim() !== "") {
		const parsedValue = Number.parseInt(value, 10);
		return SESSIONS_PER_WEEK_OPTIONS.includes(
			parsedValue as SessionsPerWeek,
		)
			? (parsedValue as SessionsPerWeek)
			: null;
	}

	return null;
}
