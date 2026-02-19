export function formatDelta(delta: number): string {
	const rounded = Math.round(delta);
	return rounded > 0 ? `+${rounded}` : `${rounded}`;
}
