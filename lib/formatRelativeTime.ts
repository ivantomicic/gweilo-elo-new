/**
 * Format a date as relative time (e.g., "15 min ago", "2 hours ago")
 */
export function formatRelativeTime(date: Date | string): string {
	const now = new Date();
	const past = typeof date === "string" ? new Date(date) : date;
	const diffMs = now.getTime() - past.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) {
		return "upravo sada";
	} else if (diffMins < 60) {
		return `pre ${diffMins} min`;
	} else if (diffHours < 24) {
		return `pre ${diffHours} ${diffHours === 1 ? "sata" : "sati"}`;
	} else if (diffDays === 1) {
		return "juče";
	} else if (diffDays < 7) {
		return `pre ${diffDays} ${diffDays === 1 ? "dana" : "dana"}`;
	} else {
		return past.toLocaleDateString("sr-RS", {
			day: "numeric",
			month: "short",
		});
	}
}

