"use client";

import Image from "next/image";
import { forwardRef, useEffect, useImperativeHandle, useId, useRef, useState } from "react";
import type { MascotController } from "./create-mascot-scene";

export type MascotHandle = Pick<MascotController, "poke" | "reset">;

type Props = {
	className?: string;
	exploded?: boolean;
	paused?: boolean;
	onReaction?: () => void;
	onStatus?: (status: "loading" | "ready" | "fallback") => void;
};

/** Lazy, reusable WebGL character with an existing brand image as a complete fallback. */
export const InteractiveMascot = forwardRef<MascotHandle, Props>(function InteractiveMascot(
	{ className, exploded = false, paused = false, onReaction, onStatus }, ref,
) {
	const descriptionId = useId();
	const canvas = useRef<HTMLCanvasElement>(null);
	const controller = useRef<MascotController | null>(null);
	const callbacks = useRef({ onReaction, onStatus });
	callbacks.current = { onReaction, onStatus };
	const options = useRef({ exploded, paused });
	options.current = { exploded, paused };
	const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");

	useImperativeHandle(ref, () => ({ poke: () => controller.current?.poke(), reset: () => controller.current?.reset() }), []);
	useEffect(() => { controller.current?.setExploded(exploded); }, [exploded]);
	useEffect(() => { controller.current?.setPaused(paused); }, [paused]);

	useEffect(() => {
		let cancelled = false;
		let readyFrame = 0;
		const showStatus = (value: typeof status) => {
			if (cancelled) return;
			setStatus(value);
			callbacks.current.onStatus?.(value);
		};
		showStatus("loading");
		void import("./create-mascot-scene").then(({ createMascotScene }) => {
			if (cancelled || !canvas.current) return;
			controller.current = createMascotScene(canvas.current, {
				onReaction: () => callbacks.current.onReaction?.(),
				onError: () => { cancelAnimationFrame(readyFrame); showStatus("fallback"); },
			});
			controller.current.setExploded(options.current.exploded);
			controller.current.setPaused(options.current.paused);
			readyFrame = requestAnimationFrame(() => showStatus("ready"));
		}).catch(() => showStatus("fallback"));
		return () => {
			cancelled = true;
			cancelAnimationFrame(readyFrame);
			controller.current?.dispose();
			controller.current = null;
		};
	}, []);

	return (
		<div className={className} data-mascot-state={status} style={{ position: "relative", width: "100%", height: "100%" }}>
			{status !== "ready" && (
				<div className="absolute inset-0 flex items-center justify-center">
					<Image src="/logo.png" alt="Gweilo, bela loptica oštrih očiju uz ljubičasti reket" width={640} height={640} className="h-4/5 w-4/5 object-contain" priority />
				</div>
			)}
			<span id={descriptionId} className="sr-only">Prati kursor. Klikni ili pritisni Enter da ga bocneš. Prevuci ili koristi strelice da ga okreneš. R vraća početni položaj.</span>
			<canvas
				ref={canvas}
				role="button"
				tabIndex={status === "ready" ? 0 : -1}
				aria-label="Bocni Gweila"
				aria-describedby={descriptionId}
				aria-hidden={status !== "ready"}
				className="mascot-canvas"
				style={{ width: "100%", height: "100%", display: "block", opacity: status === "ready" ? 1 : 0, touchAction: "pan-y" }}
			/>
		</div>
	);
});
