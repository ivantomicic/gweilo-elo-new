import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

// Shared origin keeps the ball concentric with every layer of the blade.
export const BALL_CENTER_Y = 0.28;
export const BALL_RADIUS = 0.505;
export const APERTURE_RADIUS = 0.735;

export function createMascotModel(maxAnisotropy = 1) {
	const geometries: THREE.BufferGeometry[] = [];
	const materials: THREE.Material[] = [];
	const textures: THREE.Texture[] = [];
	const geo = <T extends THREE.BufferGeometry>(value: T) => { geometries.push(value); return value; };
	const mat = <T extends THREE.Material>(value: T) => { materials.push(value); return value; };
	const character = new THREE.Group();
	const assembly = new THREE.Group();
	character.add(assembly);

	function grainTexture(repeats: number, brushed = false) {
		const size = 256, bytes = new Uint8Array(size * size * 4);
		let seed = 71;
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
				const value = brushed ? 180 + Math.sin(x * 2.43) * 18 + (seed >>> 27) : 160 + (seed >>> 26);
				const offset = (y * size + x) * 4;
				bytes[offset] = bytes[offset + 1] = bytes[offset + 2] = value;
				bytes[offset + 3] = 255;
			}
		}
		const texture = new THREE.DataTexture(bytes, size, size);
		texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
		texture.repeat.set(repeats, repeats);
		texture.magFilter = THREE.LinearFilter;
		texture.minFilter = THREE.LinearMipmapLinearFilter;
		texture.generateMipmaps = true;
		texture.anisotropy = Math.min(8, maxAnisotropy);
		texture.needsUpdate = true;
		textures.push(texture);
		return texture;
	}
	const satinGrain = grainTexture(5);
	const lacquerGrain = grainTexture(12);
	const brushedGrain = grainTexture(3, true);
	const titanium = mat(new THREE.MeshPhysicalMaterial({
		color: 0xc4c2ca, metalness: 1, roughness: 0.24, roughnessMap: brushedGrain,
		clearcoat: 0.28, clearcoatRoughness: 0.2, bumpMap: brushedGrain, bumpScale: 0.0005,
	}));
	const graphite = mat(new THREE.MeshPhysicalMaterial({
		color: 0x17131f, metalness: 0.38, roughness: 0.34, roughnessMap: lacquerGrain,
		clearcoat: 0.7, clearcoatRoughness: 0.24, bumpMap: lacquerGrain, bumpScale: 0.0012,
	}));
	const violetMetal = mat(new THREE.MeshPhysicalMaterial({ color: 0x342046, metalness: 0.85, roughness: 0.29, clearcoat: 0.4 }));
	const edgeMaterial = mat(new THREE.MeshPhysicalMaterial({ color: 0x121019, metalness: 0.7, roughness: 0.32 }));
	const gripMaterial = mat(new THREE.MeshPhysicalMaterial({ color: 0x0f1013, roughness: 0.53, metalness: 0.05, bumpMap: lacquerGrain, bumpScale: 0.002 }));
	const pearl = mat(new THREE.MeshPhysicalMaterial({
		color: 0xf4f3f0, metalness: 0, roughness: 0.49, specularIntensity: 0.45,
		bumpMap: satinGrain, bumpScale: 0.0022, clearcoat: 0.08, clearcoatRoughness: 0.5,
	}));

	function silhouette(scale = 1, aperture = APERTURE_RADIUS) {
		const shape = new THREE.Shape();
		const x = (value: number) => value * scale;
		const y = (value: number) => (value - BALL_CENTER_Y) * scale + BALL_CENTER_Y;
		const curve = (a: number, b: number, c: number, d: number, e: number, f: number) => shape.bezierCurveTo(x(a), y(b), x(c), y(d), x(e), y(f));
		shape.moveTo(0, y(1.62));
		curve(0.82, 1.62, 1.2, 1.1, 1.19, 0.34);
		curve(1.19, -0.21, 1.08, -0.59, 0.85, -0.77);
		curve(0.61, -0.96, 0.29, -1.04, 0.22, -1.18);
		curve(0.15, -1.4, 0.18, -1.81, 0.235, -2.02);
		curve(0.14, -2.09, -0.14, -2.09, -0.235, -2.02);
		curve(-0.18, -1.81, -0.15, -1.4, -0.22, -1.18);
		curve(-0.29, -1.04, -0.61, -0.96, -0.85, -0.77);
		curve(-1.08, -0.59, -1.19, -0.21, -1.19, 0.34);
		curve(-1.2, 1.1, -0.82, 1.62, 0, 1.62);
		const opening = new THREE.Path();
		opening.absarc(0, BALL_CENTER_Y, aperture, 0, Math.PI * 2, true);
		shape.holes.push(opening);
		return shape;
	}
	function extrusion(shape: THREE.Shape, depth: number, bevel: number) {
		const original = new THREE.ExtrudeGeometry(shape, {
			depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel,
			bevelSegments: 8, curveSegments: 96, steps: 1,
		});
		// Weld the bevels before averaging normals: uninterrupted metal highlights.
		original.deleteAttribute("normal");
		original.deleteAttribute("uv");
		const smooth = mergeVertices(original, 0.00001);
		original.dispose();
		smooth.computeVertexNormals();
		const positions = smooth.getAttribute("position");
		const uvs = new Float32Array(positions.count * 2);
		for (let i = 0; i < positions.count; i++) {
			uvs[i * 2] = positions.getX(i) / 2.5 + 0.5;
			uvs[i * 2 + 1] = positions.getY(i) / 3.8 + 0.5;
		}
		smooth.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
		return geo(smooth);
	}
	function plate(scale: number, aperture: number, depth: number, bevel: number, material: THREE.Material) {
		return new THREE.Mesh(extrusion(silhouette(scale, aperture), depth, bevel), material);
	}

	const core = new THREE.Group();
	const chassis = plate(1, APERTURE_RADIUS, 0.13, 0.024, titanium);
	chassis.position.z = -0.065;
	core.add(chassis);
	const seam = plate(1.004, APERTURE_RADIUS + 0.005, 0.025, 0.008, edgeMaterial);
	seam.position.z = -0.0125;
	core.add(seam);
	assembly.add(core);

	function face(side: number) {
		const group = new THREE.Group();
		const rim = plate(0.994, APERTURE_RADIUS + 0.012, 0.016, 0.022, titanium);
		rim.position.z = 0.07;
		group.add(rim);
		const surface = plate(0.97, APERTURE_RADIUS + 0.02, 0.012, 0.022, graphite);
		surface.position.z = 0.112;
		group.add(surface);
		// Machined inner collar makes the empty space around the ball legible in 3D.
		const collar = new THREE.Mesh(geo(new THREE.TorusGeometry(APERTURE_RADIUS + 0.017, 0.012, 12, 160)), violetMetal);
		collar.position.set(0, BALL_CENTER_Y, 0.138);
		group.add(collar);
		group.rotation.y = side < 0 ? Math.PI : 0;
		assembly.add(group);
		return { group, surface };
	}
	const front = face(1), back = face(-1);

	function makeGrip(side: number) {
		const group = new THREE.Group();
		const shape = new THREE.Shape();
		shape.moveTo(-0.096, -1.17);
		shape.quadraticCurveTo(0, -1.22, 0.096, -1.17);
		shape.bezierCurveTo(0.086, -1.42, 0.11, -1.8, 0.15, -1.97);
		shape.quadraticCurveTo(0, -2.012, -0.15, -1.97);
		shape.bezierCurveTo(-0.11, -1.8, -0.086, -1.42, -0.096, -1.17);
		const inlay = new THREE.Mesh(extrusion(shape, 0.021, 0.018), gripMaterial);
		inlay.position.z = 0.145;
		group.add(inlay);
		for (const sign of [-1, 1]) {
			const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(sign * 0.144, -1.24, 0.152), new THREE.Vector3(sign * 0.13, -1.45, 0.153), new THREE.Vector3(sign * 0.16, -1.83, 0.153), new THREE.Vector3(sign * 0.182, -1.96, 0.15));
			group.add(new THREE.Mesh(geo(new THREE.TubeGeometry(curve, 40, 0.006, 8, false)), violetMetal));
		}
		// Recessed fasteners and a real end cap catch the same light as the frame.
		for (const y of [-1.24, -1.93]) {
			const screw = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.017, 0.017, 0.004, 20)), titanium);
			screw.rotation.x = Math.PI / 2;
			screw.position.set(0, y, 0.191);
			group.add(screw);
			const slot = new THREE.Mesh(geo(new THREE.BoxGeometry(0.018, 0.0025, 0.002)), edgeMaterial);
			slot.position.set(0, y, 0.194);
			group.add(slot);
		}
		group.rotation.y = side < 0 ? Math.PI : 0;
		assembly.add(group);
		return group;
	}
	const frontGrip = makeGrip(1), backGrip = makeGrip(-1);

	const head = new THREE.Group();
	head.position.set(0, BALL_CENTER_Y, 0);
	character.add(head);
	const ball = new THREE.Mesh(geo(new THREE.SphereGeometry(BALL_RADIUS, 128, 96)), pearl);
	head.add(ball);
	const ink = mat(new THREE.MeshPhysicalMaterial({ color: 0x050509, metalness: 0, roughness: 0.5, specularIntensity: 0.12, side: THREE.DoubleSide }));
	const eyeBases: number[][] = [];
	const eyes = [-1, 1].map((sign) => {
		const a = new THREE.Vector2(sign * BALL_RADIUS * 0.79, BALL_RADIUS * 0.24);
		const b = new THREE.Vector2(sign * BALL_RADIUS * 0.52, -BALL_RADIUS * 0.14);
		const c = new THREE.Vector2(sign * BALL_RADIUS * 0.12, -BALL_RADIUS * 0.16);
		const base: number[] = [];
		const point = (u: number, v: number) => [a.x + (b.x - a.x) * u + (c.x - a.x) * v, a.y + (b.y - a.y) * u + (c.y - a.y) * v, 0];
		const n = 18;
		for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
			base.push(...point(i / n, j / n), ...point((i + 1) / n, j / n), ...point(i / n, (j + 1) / n));
			if (i + j < n - 1) base.push(...point((i + 1) / n, j / n), ...point((i + 1) / n, (j + 1) / n), ...point(i / n, (j + 1) / n));
		}
		eyeBases.push(base);
		const geometry = geo(new THREE.BufferGeometry());
		geometry.setAttribute("position", new THREE.Float32BufferAttribute(base, 3).setUsage(THREE.DynamicDrawUsage));
		geometry.setAttribute("normal", new THREE.Float32BufferAttribute(new Float32Array(base.length), 3).setUsage(THREE.DynamicDrawUsage));
		const eye = new THREE.Mesh(geometry, ink);
		eye.frustumCulled = false;
		head.add(eye);
		return eye;
	});
	let lastBlink = -1;
	function setBlink(openness: number) {
		if (Math.abs(lastBlink - openness) < 0.001) return;
		lastBlink = openness;
		eyes.forEach((eye, index) => {
			const positions = eye.geometry.getAttribute("position"), normals = eye.geometry.getAttribute("normal");
			const base = eyeBases[index];
			for (let i = 0; i < positions.count; i++) {
				const x = base[i * 3], y = (base[i * 3 + 1] + 0.025) * openness - 0.025;
				const radius = BALL_RADIUS + 0.001;
				const z = Math.sqrt(radius * radius - x * x - y * y);
				positions.setXYZ(i, x, y, z);
				normals.setXYZ(i, x / radius, y / radius, z / radius);
			}
			positions.needsUpdate = normals.needsUpdate = true;
		});
	}
	setBlink(1);

	// A fading, tapered energy trail. HDR emission is bloomed by the studio pass.
	const orbit = new THREE.Group();
	orbit.position.y = -0.94;
	orbit.rotation.set(1.09, 0.39, -0.04);
	character.add(orbit);
	const trailUniforms = { uTime: { value: 0 }, uPulse: { value: 0 } };
	for (let i = 0; i < 3; i++) {
		const trail = mat(new THREE.ShaderMaterial({
			uniforms: { ...trailUniforms, uOffset: { value: i * 0.13 }, uIntensity: { value: i === 0 ? 1 : 0.38 } },
			transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
			vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
			fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uPulse; uniform float uOffset; uniform float uIntensity;
			void main() {
				float tail = fract(vUv.x - uTime * 0.075 + uOffset);
				float fade = pow(1.0 - tail, 1.5) * smoothstep(1.0, 0.7, tail);
				float core = pow(max(0.0, sin(vUv.y * 3.14159265)), 2.0);
				vec3 color = mix(vec3(1.8, 0.06, 7.6), vec3(4.4, 0.48, 12.4), core);
				gl_FragColor = vec4(color * (1.0 + uPulse * 0.5), fade * uIntensity);
			}`,
		}));
		const mesh = new THREE.Mesh(geo(new THREE.TorusGeometry(1.66 + i * 0.037, i === 0 ? 0.009 : 0.004, 10, 256)), trail);
		mesh.scale.y = 0.84;
		mesh.rotation.x = i * 0.019;
		orbit.add(mesh);
	}

	// Interaction uses hidden low-poly proxies, so raycasting never stalls the render loop.
	const pickMaterial = mat(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
	const ballPick = new THREE.Mesh(geo(new THREE.SphereGeometry(BALL_RADIUS, 24, 16)), pickMaterial);
	ballPick.visible = false;
	ball.add(ballPick);
	const pickGeometry = geo(new THREE.ExtrudeGeometry(silhouette(), { depth: 0.28, bevelEnabled: false, curveSegments: 12, steps: 1 }));
	const platePicks = [core, front.group, back.group].map((parent) => {
		const mesh = new THREE.Mesh(pickGeometry, pickMaterial);
		mesh.position.z = -0.14;
		mesh.visible = false;
		parent.add(mesh);
		return mesh;
	});

	return {
		character, head, orbit, core, front, back, frontGrip, backGrip,
		rayTargets: [ballPick, ...platePicks],
		setBlink,
		setEnergy(time: number, pulse: number) { trailUniforms.uTime.value = time; trailUniforms.uPulse.value = pulse; },
		dispose() { geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose()); },
	};
}
