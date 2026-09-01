/**
 * Temporarily hidden web sections. Remove a path here to restore its menu items.
 * This controls discovery only: pages, APIs and stored data remain intact.
 */
const hiddenNavigationRoutes: ReadonlySet<string> = new Set([
	"/no-shows",
	"/polls",
	"/videos",
	"/rules",
]);

export function isNavigationItemVisible(item: { url: string }): boolean {
	return !hiddenNavigationRoutes.has(item.url);
}
