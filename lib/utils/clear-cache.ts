/**
 * Clear all app caches on logout
 * 
 * Clears:
 * - localStorage (cached data like Elo history, top players, no-shows)
 * - sessionStorage (analytics tracking flags)
 */

export function clearAllCaches(): void {
	if (typeof window === "undefined") return;

	// Clear all localStorage items that start with our cache keys
	const cacheKeys = [
		"elo_history_",
		"noshow_alert_cache",
		"noshow_distribution_cache",
		"top3players_cache",
	];

	// Remove all localStorage items that match our cache patterns
	const keysToRemove: string[] = [];
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (key) {
			// Check if it's one of our cache keys
			if (
				cacheKeys.some((cacheKey) => key.startsWith(cacheKey)) ||
				cacheKeys.includes(key)
			) {
				keysToRemove.push(key);
			}
		}
	}

	// Remove all matching keys
	keysToRemove.forEach((key) => localStorage.removeItem(key));

	// Clear sessionStorage (analytics tracking flags)
	sessionStorage.clear();
}
