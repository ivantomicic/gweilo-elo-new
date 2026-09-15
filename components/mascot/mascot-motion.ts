/** Small, frame-rate-independent springs. Inputs are clamped after a suspended tab resumes. */
export type Spring = { value: number; velocity: number };
export const spring = (value = 0): Spring => ({ value, velocity: 0 });

export function stepSpring(state: Spring, target: number, dt: number, stiffness = 100, damping = 16) {
	const duration = Math.max(0, Math.min(dt, 0.05));
	const steps = Math.max(1, Math.ceil(duration / (1 / 120)));
	const step = duration / steps;
	for (let i = 0; i < steps; i++) {
		state.velocity += ((target - state.value) * stiffness - state.velocity * damping) * step;
		state.value += state.velocity * step;
	}
	return state.value;
}

export function pointerAim(clientX: number, clientY: number, rect: Pick<DOMRect, "left" | "top" | "width" | "height">) {
	return {
		x: Math.max(-1, Math.min(1, ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1)),
		y: Math.max(-1, Math.min(1, -((clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1)),
	};
}
