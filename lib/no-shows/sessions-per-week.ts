export const SESSIONS_PER_WEEK_OPTIONS = [1, 2, 3, 4] as const;

export type SessionsPerWeek = (typeof SESSIONS_PER_WEEK_OPTIONS)[number];
export const DEFAULT_SESSIONS_PER_WEEK: SessionsPerWeek = 1;

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

export function calculateNoShowPoints(
	sessionsPerWeek: SessionsPerWeek,
): number {
	return Number((1 / sessionsPerWeek).toFixed(4));
}

export function parseNoShowPoints(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "string" && value.trim() !== "") {
		const parsedValue = Number.parseFloat(value);
		return Number.isFinite(parsedValue) ? parsedValue : null;
	}

	return null;
}

export function formatNoShowPoints(value: number): string {
	return new Intl.NumberFormat("sr-Latn-RS", {
		maximumFractionDigits: 2,
	}).format(value);
}
