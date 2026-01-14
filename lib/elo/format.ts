/**
 * Elo formatting utilities for UI display
 * 
 * These functions format Elo values for display only.
 * They do NOT modify the stored values.
 */

/**
 * Format Elo for display with optional rounding
 * 
 * @param elo - Elo value (can be number or string from DB)
 * @param round - If true, round to nearest integer. If false, show 2 decimal places
 * @returns Formatted string
 * 
 * @example
 * formatElo(1498.97, true)  // "1499"
 * formatElo(1498.97, false) // "1498.97"
 * formatElo(1500.00, true)  // "1500"
 */
export function formatElo(elo: number | string | null | undefined, round: boolean = false): string {
	if (elo === null || elo === undefined) {
		return "1500";
	}

	const eloNum = typeof elo === "string" ? parseFloat(elo) : elo;

	if (isNaN(eloNum)) {
		return "1500";
	}

	if (round) {
		return Math.round(eloNum).toString();
	}

	// Show 2 decimal places, but remove trailing zeros
	return eloNum.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Format Elo change (delta) for display
 * 
 * @param delta - Elo delta value
 * @param round - If true, round to nearest integer. If false, show 2 decimal places
 * @returns Formatted string with sign (e.g., "+17.3" or "-5.67")
 * 
 * @example
 * formatEloDelta(17.3, true)  // "+17"
 * formatEloDelta(17.3, false) // "+17.3"
 * formatEloDelta(-5.67, false) // "-5.67"
 */
export function formatEloDelta(delta: number | string | null | undefined, round: boolean = false): string {
	if (delta === null || delta === undefined) {
		return "0";
	}

	const deltaNum = typeof delta === "string" ? parseFloat(delta) : delta;

	if (isNaN(deltaNum)) {
		return "0";
	}

	const sign = deltaNum >= 0 ? "+" : "-";
	const absDelta = Math.abs(deltaNum);

	if (round) {
		return `${sign}${Math.round(absDelta)}`;
	}

	// Show 2 decimal places, but remove trailing zeros
	const formatted = absDelta.toFixed(2).replace(/\.?0+$/, "");
	return `${sign}${formatted}`;
}

