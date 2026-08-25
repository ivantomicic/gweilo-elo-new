const BELGRADE_TIME_ZONE = "Europe/Belgrade";
const TIME_ZONE_SUFFIX = /(Z|[+-]\d{2}:?\d{2})$/i;

const belgradeDateParts = new Intl.DateTimeFormat("en-GB", {
	timeZone: BELGRADE_TIME_ZONE,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

const belgradeTimeParts = new Intl.DateTimeFormat("en-GB", {
	timeZone: BELGRADE_TIME_ZONE,
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	hourCycle: "h23",
});

const belgradeOffsetParts = new Intl.DateTimeFormat("en-GB", {
	timeZone: BELGRADE_TIME_ZONE,
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	hourCycle: "h23",
});

function numericParts(
	formatter: Intl.DateTimeFormat,
	date: Date,
): Record<string, number> {
	return Object.fromEntries(
		formatter
			.formatToParts(date)
			.filter((part) => part.type !== "literal")
			.map((part) => [part.type, Number(part.value)]),
	);
}

function belgradeOffsetMilliseconds(date: Date): number {
	const parts = numericParts(belgradeOffsetParts, date);
	const displayedAsUTC = Date.UTC(
		parts.year,
		parts.month - 1,
		parts.day,
		parts.hour,
		parts.minute,
		parts.second,
	);
	const instantWithoutMilliseconds = date.getTime() - date.getMilliseconds();
	return displayedAsUTC - instantWithoutMilliseconds;
}

function belgradeMidnightUTC(
	year: number,
	month: number,
	day: number,
): Date {
	const localClockAsUTC = Date.UTC(year, month - 1, day);
	let instant = localClockAsUTC;

	// Re-evaluate because the first estimate can sit on the other side of a DST
	// transition. Europe/Belgrade does not transition at midnight, so this
	// converges immediately in normal cases and remains safe at DST boundaries.
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const offset = belgradeOffsetMilliseconds(new Date(instant));
		const corrected = localClockAsUTC - offset;
		if (corrected === instant) {
			break;
		}
		instant = corrected;
	}

	return new Date(instant);
}

export function parseStoredUTCTimestamp(value: string): Date {
	const normalized = value.trim();
	return new Date(
		TIME_ZONE_SUFFIX.test(normalized) ? normalized : `${normalized}Z`,
	);
}

export function formatBelgradeDate(value: string): string {
	const parts = numericParts(
		belgradeDateParts,
		parseStoredUTCTimestamp(value),
	);
	return [parts.day, parts.month, parts.year]
		.map((part, index) =>
			index === 2 ? String(part) : String(part).padStart(2, "0"),
		)
		.join(".");
}

export function formatBelgradeDayMonth(value: string): string {
	const parts = numericParts(
		belgradeDateParts,
		parseStoredUTCTimestamp(value),
	);
	return `${String(parts.day).padStart(2, "0")}.${String(
		parts.month,
	).padStart(2, "0")}.`;
}

export function formatBelgradeTime(
	value: string,
	includeSeconds = true,
): string {
	const parts = numericParts(
		belgradeTimeParts,
		parseStoredUTCTimestamp(value),
	);
	const time = [parts.hour, parts.minute]
		.map((part) => String(part).padStart(2, "0"))
		.join(":");
	return includeSeconds
		? `${time}:${String(parts.second).padStart(2, "0")}`
		: time;
}

export function getBelgradeDayBounds(value: string): {
	start: string;
	endExclusive: string;
} {
	const [year, month, day] = value.split("-").map(Number);
	const start = belgradeMidnightUTC(year, month, day);
	const endExclusive = belgradeMidnightUTC(year, month, day + 1);
	return {
		start: start.toISOString(),
		endExclusive: endExclusive.toISOString(),
	};
}
