export type ScrubDirection = "pending" | "horizontal" | "vertical";

/** Decide once: vertical movement belongs to the page, horizontal to the chart. */
export function scrubDirection(
	current: ScrubDirection,
	deltaX: number,
	deltaY: number,
): ScrubDirection {
	if (current !== "pending") return current;
	if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 6) return "pending";
	return Math.abs(deltaX) > Math.abs(deltaY) ? "horizontal" : "vertical";
}

/** Match the numeric chart domain, including gaps in the match history. */
export function nearestScrubIndex(
	points: readonly { match: number }[],
	clientX: number,
	left: number,
	width: number,
): number | null {
	if (!points.length || width <= 0 || !Number.isFinite(clientX)) return null;
	const fraction = Math.max(0, Math.min(1, (clientX - left) / width));
	const target = points[0].match + fraction * (points[points.length - 1].match - points[0].match);
	let low = 0;
	let high = points.length - 1;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		if (points[middle].match < target) low = middle + 1;
		else high = middle;
	}
	if (low === 0) return 0;
	return target - points[low - 1].match <= points[low].match - target ? low - 1 : low;
}
