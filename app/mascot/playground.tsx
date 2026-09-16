"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Hand, Layers2, RotateCcw, Pause, Play, MoveUpRight } from "lucide-react";
import { InteractiveMascot, type MascotHandle } from "@/components/mascot/interactive-mascot";
import "./playground.css";

export function MascotPlayground() {
	const mascot = useRef<MascotHandle>(null);
	const [exploded, setExploded] = useState(false);
	const [paused, setPaused] = useState(false);
	const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
	const [reaction, setReaction] = useState("");
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const pokes = useRef(0);
	const react = useCallback(() => {
		pokes.current += 1;
		const responses = ["Ej.", "Video sam te.", "Hoćemo za sto?", "Dobro, dobro."];
		setReaction(responses[(pokes.current - 1) % responses.length]);
		clearTimeout(timer.current);
		timer.current = setTimeout(() => setReaction(""), 1800);
	}, []);
	useEffect(() => () => clearTimeout(timer.current), []);

	return (
		<main className="mascot-playground">
			<header className="mascot-topbar">
				<Link href="/" className="mascot-back" aria-label="Nazad u klub"><ArrowLeft size={16} /><span>Nazad u klub</span></Link>
				<span className="mascot-wordmark">GWEILO<span> / </span>MASKOTA</span>
				<span className="mascot-edition">01 — INTERAKTIVNO</span>
			</header>

			<section className="mascot-stage" aria-label="Interaktivna Gweilo maskota">
				<div className="mascot-stage-caption">
					<h1>Ima svoj stav.</h1>
					<p>Sada i prema tvom kursoru.</p>
				</div>
				<div className="mascot-render">
					<InteractiveMascot ref={mascot} exploded={exploded} paused={paused} onReaction={react} onStatus={setStatus} />
				</div>
				<div className="mascot-reaction" role="status" aria-live="polite">{reaction}</div>
				<div className="mascot-stage-note" aria-hidden="true"><MoveUpRight size={15} /><span>Pomeri kursor.<br />On već gleda.</span></div>
			</section>

			<footer className="mascot-footer">
				<div className="mascot-instructions">
					<span className="mascot-dot" data-ready={status === "ready"} />
					<p>{status === "loading" ? "Gweilo stiže…" : status === "fallback" ? "3D prikaz nije dostupan u ovom pregledaču." : "Dodirni lopticu. Prevuci da ga okreneš."}</p>
				</div>
				<div className="mascot-controls" aria-label="Kontrole maskote">
					<button type="button" className="mascot-poke" disabled={status !== "ready"} onClick={() => mascot.current?.poke()}><Hand size={17} />Bocni ga</button>
					<button type="button" disabled={status !== "ready"} aria-pressed={exploded} onClick={() => setExploded((value) => !value)}><Layers2 size={17} />{exploded ? "Sastavi" : "Rastavi"}</button>
					<button type="button" disabled={status !== "ready"} aria-pressed={paused} aria-label={paused ? "Pokreni animaciju" : "Pauziraj animaciju"} onClick={() => setPaused((value) => !value)}>{paused ? <Play size={17} /> : <Pause size={17} />}</button>
					<button type="button" disabled={status !== "ready"} aria-label="Vrati početni položaj" onClick={() => { setExploded(false); mascot.current?.reset(); }}><RotateCcw size={17} /></button>
				</div>
			</footer>
		</main>
	);
}
