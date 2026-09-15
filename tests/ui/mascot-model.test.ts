import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BALL_CENTER_Y, BALL_RADIUS, createMascotModel } from "../../components/mascot/mascot-model";

test("the assembled paddle has open space around the centered ball from both sides", () => {
	const model = createMascotModel();
	try {
		assert.deepEqual(model.head.position.toArray(), [0, BALL_CENTER_Y, 0]);
		const raycaster = new THREE.Raycaster();
		const plates = [model.core, model.front.group, model.back.group];
		for (const yaw of [-0.2, 0, 0.2]) {
			model.character.rotation.y = yaw;
			model.character.updateMatrixWorld(true);
			for (const direction of [-1, 1]) for (let i = 0; i < 32; i++) {
				const angle = i / 32 * Math.PI * 2;
				const point = new THREE.Vector3(Math.cos(angle) * (BALL_RADIUS + 0.09), BALL_CENTER_Y + Math.sin(angle) * (BALL_RADIUS + 0.09), 0).applyMatrix4(model.character.matrixWorld);
				raycaster.set(new THREE.Vector3(point.x, point.y, direction * 5), new THREE.Vector3(0, 0, -direction));
				assert.equal(raycaster.intersectObjects(plates, true).length, 0, `clearance at yaw ${yaw}, angle ${angle}, side ${direction}`);
			}
		}
	} finally { model.dispose(); }
});

test("blinking eyes stay on the sphere instead of sinking into or floating above it", () => {
	const model = createMascotModel();
	try {
		const eyes = model.head.children.slice(1) as THREE.Mesh[];
		for (const openness of [1, 0.5, 0.09, 1]) {
			model.setBlink(openness);
			for (const eye of eyes) {
				const positions = eye.geometry.getAttribute("position");
				for (let i = 0; i < positions.count; i++) {
					const distance = Math.hypot(positions.getX(i), positions.getY(i), positions.getZ(i));
					assert.ok(Math.abs(distance - BALL_RADIUS - 0.001) < 0.00001);
				}
			}
		}
	} finally { model.dispose(); }
});
