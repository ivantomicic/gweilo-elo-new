import * as THREE from "three";
import { pointerAim, spring, stepSpring } from "./mascot-motion";
import { BALL_CENTER_Y, createMascotModel } from "./mascot-model";
import { createMascotStudio } from "./mascot-studio";

export type MascotController = {
	poke: () => void;
	reset: () => void;
	setExploded: (value: boolean) => void;
	setPaused: (value: boolean) => void;
	dispose: () => void;
};

type Options = { onReaction: () => void; onError: () => void };

export function createMascotScene(canvas: HTMLCanvasElement, { onReaction, onError }: Options): MascotController {
	const studio = createMascotStudio(canvas);
	let model: ReturnType<typeof createMascotModel>;
	try { model = createMascotModel(studio.renderer.capabilities.getMaxAnisotropy()); } catch (error) { studio.dispose(); throw error; }
	const { camera } = studio;
	const { character, head, orbit, core, front, back, frontGrip, backGrip } = model;
	studio.scene.add(character);
	const aim = new THREE.Vector2();
	const yaw = spring(-0.1), pitch = spring(0), roll = spring(-0.035);
	const headYaw = spring(), headPitch = spring();
	const recoil = spring(), explode = spring();
	const gazeX = spring(), gazeY = spring();
	let turn = 0, tilt = 0, expanded = false, paused = false, cameraDistance = 9, expandedCameraDistance = 12;
	let time = 0, blinkAt = 4.1, reactionAge = 10;
	let raf = 0, previousTime = 0, inView = true, disposed = false, contextLost = false;
	let drag: { id: number; x: number; y: number; lastX: number; lastY: number; moved: boolean } | null = null;
	const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
	const raycaster = new THREE.Raycaster();
	const rayPoint = new THREE.Vector2();
	const rayTargets = model.rayTargets;
	const host = canvas.parentElement!;

	function poke() {
		if (disposed || contextLost) return;
		reactionAge = 0;
		if (!reducedMotion.matches) {
			recoil.velocity = Math.max(-1.8, recoil.velocity - 1.45);
			roll.velocity = THREE.MathUtils.clamp(roll.velocity + (aim.x > 0 ? -0.3 : 0.3), -0.8, 0.8);
			headPitch.velocity = Math.min(0.75, headPitch.velocity + 0.55);
		}
		onReaction();
		wake();
	}
	function resize() {
		const { width, height } = host.getBoundingClientRect();
		if (width < 1 || height < 1) return;
		camera.aspect = width / height;
		const horizontalFrustum = 2 * Math.tan(THREE.MathUtils.degToRad(15)) * camera.aspect;
		cameraDistance = Math.max(8.5, 3.65 / horizontalFrustum);
		expandedCameraDistance = Math.max(10.2, 6.3 / horizontalFrustum);
		camera.position.z = THREE.MathUtils.lerp(cameraDistance, expandedCameraDistance, explode.value);
		camera.updateProjectionMatrix();
		studio.resize(width, height);
		wake();
	}
	function updatePointer(event: PointerEvent) {
		const bounds = canvas.getBoundingClientRect();
		const position = pointerAim(event.clientX, event.clientY, bounds);
		aim.set(position.x, position.y);
		wake();
	}
	function hit(event: PointerEvent) {
		const bounds = canvas.getBoundingClientRect();
		rayPoint.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
		raycaster.setFromCamera(rayPoint, camera);
		return raycaster.intersectObjects(rayTargets, false).length > 0;
	}
	function pointerDown(event: PointerEvent) {
		if (drag || !event.isPrimary || event.button !== 0 || !hit(event)) return;
		drag = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false };
		canvas.setPointerCapture(event.pointerId);
		canvas.style.cursor = "grabbing";
		canvas.focus({ preventScroll: true });
	}
	function pointerMove(event: PointerEvent) {
		if (!drag || drag.id !== event.pointerId) {
			canvas.style.cursor = hit(event) ? "grab" : "default";
			return;
		}
		if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 6) drag.moved = true;
		if (drag.moved) {
			turn += (event.clientX - drag.lastX) * 0.0055;
			tilt = THREE.MathUtils.clamp(tilt + (event.clientY - drag.lastY) * 0.003, -0.55, 0.55);
		}
		drag.lastX = event.clientX;
		drag.lastY = event.clientY;
		wake();
	}
	function pointerEnd(event: PointerEvent) {
		if (!drag || drag.id !== event.pointerId) return;
		const shouldPoke = !drag.moved && event.type === "pointerup";
		drag = null;
		if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
		canvas.style.cursor = "grab";
		if (shouldPoke) poke();
		if (event.pointerType === "touch") { aim.set(0, 0); wake(); }
	}
	function keyboard(event: KeyboardEvent) {
		if (event.key === "Enter" || event.key === " ") { event.preventDefault(); poke(); }
		if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
			event.preventDefault(); turn += event.key === "ArrowLeft" ? -0.25 : 0.25; wake();
		}
		if (event.key === "Escape" || event.key.toLowerCase() === "r") { turn = tilt = 0; wake(); }
	}
	function render(now: number) {
		raf = 0;
		if (disposed || contextLost || !inView || document.hidden) return;
		const dt = previousTime ? Math.min((now - previousTime) / 1000, 0.05) : 1 / 60;
		previousTime = now;
		const idle = !paused && !reducedMotion.matches;
		if (idle) time += dt;
		reactionAge += dt;
		const follow = (state: ReturnType<typeof spring>, target: number, stiffness = 48, damping = 14) => {
			if (reducedMotion.matches) { state.value = target; state.velocity = 0; return target; }
			return stepSpring(state, target, dt, stiffness, damping);
		};
		const xTarget = reducedMotion.matches ? 0 : aim.x, yTarget = reducedMotion.matches ? 0 : aim.y;
		// Eyes lead; the paddle follows with more weight. Both retain velocity when interrupted.
		const x = follow(gazeX, xTarget, 65, 17), y = follow(gazeY, yTarget, 65, 17);
		const pitchTarget = tilt - y * 0.045, yawTarget = turn - 0.1 + x * 0.085;
		character.rotation.set(follow(pitch, pitchTarget, 36, 12), follow(yaw, yawTarget, 36, 12), follow(roll, -0.035, 48, 12));
		character.position.y = Math.sin(time * 0.85) * 0.014;
		const kick = follow(recoil, 0, 85, 13);
		head.rotation.set(follow(headPitch, -y * 0.2, 60, 16), follow(headYaw, x * 0.29, 60, 16), 0);
		// No forward offset: the sphere remains suspended in the center of the aperture.
		head.position.set(0, BALL_CENTER_Y + Math.sin(time * 1.05) * 0.005, kick);
		head.scale.set(1 - kick * 0.035, 1 + kick * 0.035, 1);
		const amount = follow(explode, expanded ? 1 : 0, 30, 12);
		camera.position.z = THREE.MathUtils.lerp(cameraDistance, expandedCameraDistance, amount);
		front.group.position.set(amount * 1.52, amount * 0.12, amount * 0.7);
		front.group.rotation.y = -amount * 0.55;
		back.group.position.set(-amount * 1.52, amount * 0.12, -amount * 0.35);
		back.group.rotation.y = Math.PI + amount * 0.55;
		core.position.z = -amount * 0.65;
		frontGrip.position.set(amount * 0.42, -amount * 0.28, amount * 0.55);
		frontGrip.rotation.y = -amount * 0.22;
		backGrip.position.set(-amount * 0.42, -amount * 0.28, -amount * 0.4);
		backGrip.rotation.y = Math.PI + amount * 0.22;
		orbit.rotation.y = 0.39 + Math.sin(time * 0.23) * 0.035;
		model.setEnergy(time, reducedMotion.matches ? 0 : Math.max(0, 1 - reactionAge / 0.65));
		if (time > blinkAt + 0.25) blinkAt = time + 4.5 + Math.sin(time * 2) * 1.3;
		const blinkProgress = (time - blinkAt) / 0.25;
		const blink = blinkProgress > 0 && blinkProgress < 1 ? 1 - Math.sin(blinkProgress * Math.PI) ** 2 * 0.91 : 1;
		const flinch = reactionAge < 0.3 && !reducedMotion.matches ? 1 - Math.sin(reactionAge / 0.3 * Math.PI) * 0.45 : 1;
		model.setBlink(reducedMotion.matches ? 1 : Math.min(blink, flinch));
		studio.render();
		const settling = [
			[gazeX, xTarget], [gazeY, yTarget], [pitch, pitchTarget], [yaw, yawTarget],
			[roll, -0.035], [headPitch, -y * 0.2], [headYaw, x * 0.29], [recoil, 0], [explode, expanded ? 1 : 0],
		] as const;
		if (idle || (reactionAge < 0.7 && !reducedMotion.matches) || settling.some(([state, target]) => Math.abs(state.value - target) > 0.0005 || Math.abs(state.velocity) > 0.0005)) raf = requestAnimationFrame(render);
	}

	function wake() {
		if (!disposed && !contextLost && !raf && inView && !document.hidden) raf = requestAnimationFrame(render);
	}
	function visibility() {
		previousTime = 0;
		if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else wake();
	}
	function lost(event: Event) {
		event.preventDefault(); contextLost = true; cancelAnimationFrame(raf); raf = 0; onError();
	}
	const observer = new IntersectionObserver(([entry]) => {
		inView = entry.isIntersecting;
		previousTime = 0;
		if (inView) wake(); else { cancelAnimationFrame(raf); raf = 0; }
	});
	observer.observe(canvas);
	const resizeObserver = new ResizeObserver(resize);
	resizeObserver.observe(host);
	window.addEventListener("pointermove", updatePointer, { passive: true });
	canvas.addEventListener("pointerdown", pointerDown);
	canvas.addEventListener("pointermove", pointerMove);
	canvas.addEventListener("pointerup", pointerEnd);
	canvas.addEventListener("pointercancel", pointerEnd);
	canvas.addEventListener("lostpointercapture", pointerEnd);
	canvas.addEventListener("keydown", keyboard);
	canvas.addEventListener("webglcontextlost", lost);
	document.addEventListener("visibilitychange", visibility);
	reducedMotion.addEventListener("change", wake);
	resize();

	return {
		poke,
		reset() { turn = tilt = 0; aim.set(0, 0); wake(); },
		setExploded(value) { expanded = value; wake(); },
		setPaused(value) { paused = value; wake(); },
		dispose() {
			disposed = true;
			cancelAnimationFrame(raf);
			observer.disconnect(); resizeObserver.disconnect();
			window.removeEventListener("pointermove", updatePointer);
			canvas.removeEventListener("pointerdown", pointerDown);
			canvas.removeEventListener("pointermove", pointerMove);
			canvas.removeEventListener("pointerup", pointerEnd);
			canvas.removeEventListener("pointercancel", pointerEnd);
			canvas.removeEventListener("lostpointercapture", pointerEnd);
			canvas.removeEventListener("keydown", keyboard);
			canvas.removeEventListener("webglcontextlost", lost);
			document.removeEventListener("visibilitychange", visibility);
			reducedMotion.removeEventListener("change", wake);
			model.dispose(); studio.dispose();
		},
	};
}
