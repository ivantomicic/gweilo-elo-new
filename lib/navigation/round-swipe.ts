export type SwipePoint = { x: number; y: number };

export function isRoundSwipeAtRest(offset: number | string) {
	return Math.abs(parseFloat(String(offset))) <= 0.5;
}

/** Lock a gesture early so a vertical scroll cannot turn into round navigation. */
export function getRoundSwipeAxis(start: SwipePoint, end: SwipePoint) {
	const x = Math.abs(end.x - start.x);
	const y = Math.abs(end.y - start.y);
	if (Math.max(x, y) < 10) return null;
	if (x > y * 1.2) return "horizontal";
	if (y >= x) return "vertical";
	return null;
}

export function getRoundSwipeDirection(start: SwipePoint, end: SwipePoint) {
	const deltaX = end.x - start.x;
	if (Math.abs(deltaX) < 52 || getRoundSwipeAxis(start, end) !== "horizontal") {
		return null;
	}
	return deltaX < 0 ? "next" : "previous";
}
