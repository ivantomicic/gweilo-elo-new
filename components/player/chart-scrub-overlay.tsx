"use client";

import { useCallback, useEffect, useRef } from "react";
import { nearestScrubIndex, scrubDirection, type ScrubDirection } from "@/lib/charts/scrub";

type ScrubOverlayProps = {
	points: readonly { match: number }[];
	selectedIndex: number | null;
	onSelect: (index: number | null) => void;
	// Supplied by Recharts Customized: the actual plot area, excluding both axes.
	offset?: { left: number; top: number; width: number; height: number };
};

type Gesture = {
	pointerId: number;
	x: number;
	y: number;
	direction: ScrubDirection;
	previousIndex: number | null;
};

export function ChartScrubOverlay({ points, selectedIndex, onSelect, offset }: ScrubOverlayProps) {
	const gesture = useRef<Gesture | null>(null);
	const plot = useRef<SVGRectElement>(null);
	const selectAt = useCallback((clientX: number) => {
		const bounds = plot.current?.getBoundingClientRect();
		if (!bounds) return;
		const index = nearestScrubIndex(points, clientX, bounds.left, bounds.width);
		if (index !== null) onSelect(index);
	}, [points, onSelect]);
	const finish = useCallback((event: PointerEvent, cancelled = false) => {
		const active = gesture.current;
		if (!active || active.pointerId !== event.pointerId) return;
		gesture.current = null;
		if (active.direction === "vertical" || (cancelled && active.direction === "pending")) {
			onSelect(active.previousIndex);
		} else if (!cancelled) {
			selectAt(event.clientX);
		}
		if (plot.current?.hasPointerCapture(event.pointerId)) {
			plot.current.releasePointerCapture(event.pointerId);
		}
	}, [onSelect, selectAt]);

	useEffect(() => {
		// Window listeners also finish drags if SVG pointer capture is unavailable.
		// They never preventDefault: vertical scroll and pinch zoom remain native.
		const move = (event: PointerEvent) => {
			const active = gesture.current;
			if (!active || active.pointerId !== event.pointerId) return;
			active.direction = scrubDirection(active.direction, event.clientX - active.x, event.clientY - active.y);
			if (active.direction === "horizontal") selectAt(event.clientX);
		};
		const up = (event: PointerEvent) => finish(event);
		const cancel = (event: PointerEvent) => finish(event, true);
		const blur = () => { gesture.current = null; };
		window.addEventListener("pointermove", move, { passive: true });
		window.addEventListener("pointerup", up);
		window.addEventListener("pointercancel", cancel);
		window.addEventListener("blur", blur);
		return () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
			window.removeEventListener("pointercancel", cancel);
			window.removeEventListener("blur", blur);
		};
	}, [finish, selectAt]);

	if (!offset || offset.width <= 0 || offset.height <= 0) return null;

	return (
		<rect
			ref={plot}
			data-chart-scrub
			x={offset.left}
			y={offset.top}
			width={offset.width}
			height={offset.height}
			fill="transparent"
			aria-hidden="true"
			style={{ touchAction: "pan-y pinch-zoom", cursor: "crosshair", WebkitUserSelect: "none", userSelect: "none" }}
			onPointerDown={(event) => {
				if (!event.isPrimary || gesture.current || event.button !== 0) return;
				gesture.current = {
					pointerId: event.pointerId,
					x: event.clientX,
					y: event.clientY,
					direction: event.pointerType === "touch" ? "pending" : "horizontal",
					previousIndex: selectedIndex,
				};
				try {
					event.currentTarget.setPointerCapture(event.pointerId);
				} catch {
					// The window handlers keep the gesture usable in embedded browsers.
				}
				selectAt(event.clientX);
			}}
			onPointerMove={(event) => {
				if (!gesture.current && event.pointerType === "mouse" && event.buttons === 0) {
					selectAt(event.clientX);
				}
			}}
			onLostPointerCapture={(event) => finish(event.nativeEvent, true)}
			onContextMenu={(event) => event.preventDefault()}
			// Recharts also translates legacy touch/mouse events into tooltip state.
			// Keep a single scrub path without suppressing the browser's scroll/zoom.
			onMouseMove={(event) => event.stopPropagation()}
			onTouchMove={(event) => event.stopPropagation()}
			onClick={(event) => event.stopPropagation()}
		/>
	);
}
