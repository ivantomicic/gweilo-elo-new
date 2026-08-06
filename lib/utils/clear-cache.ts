/**
 * Clear all app caches on logout
 * 
 * Clears:
 * - localStorage (cached data like Elo history, top players, no-shows)
 * - sessionStorage (analytics tracking flags)
 */

function clearLocalStorageByPrefix(cacheKeys: string[]): void {
	if (typeof window === "undefined") return;

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
}

/** Clear data that becomes stale after a completed session is deleted. */
export function clearSessionDeletionCaches(): void {
	clearLocalStorageByPrefix([
		"elo_history_",
		"sessions-page:",
		"no_show_alert_cache",
		"noshow_alert_cache",
		"noshow_distribution_cache",
		"top3players_cache",
	]);
}

export function clearAllCaches(): void {
	if (typeof window === "undefined") return;

	clearSessionDeletionCaches();

	// Clear sessionStorage (analytics tracking flags)
	sessionStorage.clear();
}
