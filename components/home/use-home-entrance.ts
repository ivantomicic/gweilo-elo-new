"use client";

import { usePageEntrance } from "../ui/use-page-entrance";

// Last section: 600ms delay + 480ms entrance; leave room for the 650ms number roll.
export const HOME_ENTRANCE_SETTLE_MS = 1_400;

/** One decorative entrance per visit, never on the 15-second background refresh. */
export function useHomeEntrance(ready: boolean) {
	return usePageEntrance(ready, HOME_ENTRANCE_SETTLE_MS).skipEntrance;
}
