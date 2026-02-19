import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

type UseHorizontalScrollIndicatorsResult = {
	scrollRef: RefObject<HTMLDivElement>;
	canScrollLeft: boolean;
	canScrollRight: boolean;
	updateScrollIndicators: () => void;
};

export function useHorizontalScrollIndicators(
	itemsCount: number,
): UseHorizontalScrollIndicatorsResult {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [canScrollLeft, setCanScrollLeft] = useState(false);
	const [canScrollRight, setCanScrollRight] = useState(false);

	const updateScrollIndicators = useCallback(() => {
		const element = scrollRef.current;
		if (!element) return;
		setCanScrollLeft(element.scrollLeft > 0);
		setCanScrollRight(
			element.scrollLeft < element.scrollWidth - element.clientWidth - 1,
		);
	}, []);

	useEffect(() => {
		updateScrollIndicators();
		window.addEventListener("resize", updateScrollIndicators);
		return () => window.removeEventListener("resize", updateScrollIndicators);
	}, [updateScrollIndicators, itemsCount]);

	return {
		scrollRef,
		canScrollLeft,
		canScrollRight,
		updateScrollIndicators,
	};
}
