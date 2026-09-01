const eloFormatter = new Intl.NumberFormat("sr-Latn-RS", {
	maximumFractionDigits: 0,
});

export function formatElo(elo: number): string {
	return eloFormatter.format(Math.round(elo));
}

export function formatDelta(delta: number): string {
	// Swift's rounded() uses nearest/away-from-zero for a half-point tie.
	const rounded = delta < 0 ? -Math.round(-delta) : Math.round(delta);
	return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

export function eloDeltaClass(delta: number): string {
	if (delta > 0.004) return "text-[rgb(var(--ds-native-lime))]";
	if (delta < -0.004) return "text-[rgb(var(--ds-native-coral))]";
	return "text-[rgb(var(--ds-native-amber))]";
}

export function opponentLabel(count: number): string {
	return count === 1 ? "protivnik" : "protivnika";
}
