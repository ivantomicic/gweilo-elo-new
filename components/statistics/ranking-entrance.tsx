"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { usePageEntrance } from "../ui/use-page-entrance";

export const RANKING_ENTRANCE_ROW_LIMIT = 8;
export const rankingEntranceDelay = (index: number) => 80 + Math.min(Math.max(index, 0), RANKING_ENTRANCE_ROW_LIMIT - 1) * 70;

export function useRankingEntrance(ready: boolean, view: string) {
	const initialView = useRef(view);
	const { skipEntrance, finishEntrance } = usePageEntrance(ready);
	useEffect(() => {
		if (view !== initialView.current) finishEntrance();
	}, [view, finishEntrance]);
	return {
		animateEntrance: !skipEntrance && view === initialView.current,
		finishEntrance,
	};
}

/** Animate only the leading rows, never a whole page or an unbounded long list. */
export function RankingEntranceItem({ index, animate, children }: {
	index: number;
	animate: boolean;
	children: ReactNode;
}) {
	return (
		<li
			className={animate && index < RANKING_ENTRANCE_ROW_LIMIT ? "ranking-enter" : undefined}
			style={{ "--ranking-enter-delay": `${rankingEntranceDelay(index)}ms` } as CSSProperties}
			data-number-entrance
		>
			{children}
		</li>
	);
}
