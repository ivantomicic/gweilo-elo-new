import assert from "node:assert/strict";
import test from "node:test";
import { pointerAim, spring, stepSpring } from "../../components/mascot/mascot-motion";

test("tracking settles at the same position on 30, 60, and 120 Hz displays", () => {
	const samples = [30, 60, 120].map((fps) => {
		const state = spring(-0.24);
		for (let frame = 0; frame < fps * 2; frame++) stepSpring(state, 0.7, 1 / fps, 36, 12);
		assert.ok(Math.abs(state.value - 0.7) < 0.001);
		assert.ok(Math.abs(state.velocity) < 0.001);
		return state.value;
	});
	assert.ok(Math.max(...samples) - Math.min(...samples) < 0.001);
});

test("a poke stays finite after a background tab resumes and settles back", () => {
	const state = spring();
	state.velocity = -1.8;
	stepSpring(state, 0, 60, 85, 13);
	assert.ok(Number.isFinite(state.value));
	assert.ok(Math.abs(state.value) < 0.12);
	for (let frame = 0; frame < 240; frame++) stepSpring(state, 0, 1 / 60, 85, 13);
	assert.ok(Math.abs(state.value) < 0.001);
	assert.ok(Math.abs(state.velocity) < 0.001);
});

test("pointer tracking accounts for an offset canvas and clamps outside its edges", () => {
	const rect = { left: 100, top: 70, width: 400, height: 600 };
	const center = pointerAim(300, 370, rect);
	assert.equal(center.x, 0);
	assert.equal(Math.abs(center.y), 0);
	assert.deepEqual(pointerAim(100, 70, rect), { x: -1, y: 1 });
	assert.deepEqual(pointerAim(900, 1000, rect), { x: 1, y: -1 });
	const collapsed = pointerAim(300, 370, { ...rect, width: 0, height: 0 });
	assert.ok(Number.isFinite(collapsed.x) && Number.isFinite(collapsed.y));
});
