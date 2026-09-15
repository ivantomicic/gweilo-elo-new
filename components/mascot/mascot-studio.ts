import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/** An image-based studio rig: broad softboxes, negative fill, and a restrained violet rim. */
export function createMascotStudio(canvas: HTMLCanvasElement) {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.AgXToneMapping;
	renderer.toneMappingExposure = 1.35;
	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0x030304);
	const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
	camera.position.set(0, 0, 9);
	camera.lookAt(0, -0.2, 0);

	const studio = new THREE.Scene();
	studio.background = new THREE.Color(0.045, 0.048, 0.062);
	const panels: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
	function softbox(width: number, height: number, color: number, strength: number, position: [number, number, number]) {
		const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(strength), side: THREE.DoubleSide }));
		mesh.position.set(...position);
		mesh.lookAt(0, 0, 0);
		studio.add(mesh);
		panels.push(mesh);
	}
	softbox(3.5, 6, 0xfff9f3, 7, [-4, 4, 5]);
	softbox(2, 7, 0xe4e8ff, 4, [5, 1, 3]);
	softbox(5, 1.5, 0xffffff, 5, [0, 6, -2]);
	softbox(1.4, 6, 0x9460ef, 7, [3, 0.5, -3]);
	softbox(3, 4, 0x7285a6, 0.5, [-2, -3, 4]);
	const pmrem = new THREE.PMREMGenerator(renderer);
	const environment = pmrem.fromScene(studio, 0.06, 0.1, 30, { size: 512 });
	scene.environment = environment.texture;
	scene.environmentIntensity = 0.9;
	panels.forEach((panel) => { panel.geometry.dispose(); panel.material.dispose(); });
	pmrem.dispose();

	RectAreaLightUniformsLib.init();
	function areaLight(color: number, intensity: number, width: number, height: number, position: [number, number, number]) {
		const light = new THREE.RectAreaLight(color, intensity, width, height);
		light.position.set(...position);
		light.lookAt(0, 0.28, 0);
		scene.add(light);
	}
	areaLight(0xf5f6ff, 4.5, 4, 5, [-3.5, 4, 5]);
	areaLight(0xd2dcff, 0.65, 4, 5, [4, 0, 4]);
	areaLight(0x8a46e8, 2, 2, 5, [3, 0, -2]);

	// Multisampled HDR buffer preserves fine edges; bloom affects the energy trail, not the whole image.
	const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Math.min(4, renderer.capabilities.maxSamples) });
	const composer = new EffectComposer(renderer, target);
	const renderPass = new RenderPass(scene, camera);
	const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.15, 0.4, 0.1);
	const glowSource = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
	const black = new THREE.MeshBasicMaterial({ color: 0, side: THREE.DoubleSide });
	const maskBackground = new THREE.Color(0);
	const combine = new ShaderPass({
		uniforms: { tDiffuse: { value: null }, tBloom: { value: bloom.renderTargetsHorizontal[0].texture } },
		vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
		fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tBloom; varying vec2 vUv;
		void main() { gl_FragColor = texture2D(tDiffuse, vUv) + vec4(texture2D(tBloom, vUv).rgb, 0.0); }`,
	});
	let occluders: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] | null = null;
	const output = new OutputPass();
	composer.addPass(renderPass);
	composer.addPass(combine);
	composer.addPass(output);
	return {
		renderer, scene, camera,
		resize(width: number, height: number) {
			renderer.setSize(width, height, false);
			composer.setSize(width, height);
			// Glow needs a soft, half-resolution buffer; the model stays multisampled at full resolution.
			const scale = Math.min(renderer.getPixelRatio(), 1);
			glowSource.setSize(Math.ceil(width * scale), Math.ceil(height * scale));
			bloom.setSize(Math.ceil(width * scale), Math.ceil(height * scale));
		},
		render() {
			if (!occluders) {
				occluders = [];
				scene.traverse((object) => {
					if (object instanceof THREE.Mesh && !(object.material instanceof THREE.ShaderMaterial)) occluders!.push({ mesh: object, material: object.material });
				});
			}
			const background = scene.background;
			try {
				// Preserve depth occlusion while isolating emission: metal and skin never acquire a fake glow.
				occluders.forEach(({ mesh }) => { mesh.material = black; });
				scene.background = maskBackground;
				renderer.setRenderTarget(glowSource);
				renderer.clear();
				renderer.render(scene, camera);
				bloom.render(renderer, glowSource, glowSource, 0, false);
			} finally {
				occluders.forEach(({ mesh, material }) => { mesh.material = material; });
				scene.background = background;
				renderer.setRenderTarget(null);
			}
			composer.render();
		},
		dispose() { black.dispose(); glowSource.dispose(); bloom.dispose(); combine.dispose(); output.dispose(); renderPass.dispose(); composer.dispose(); environment.dispose(); renderer.dispose(); renderer.forceContextLoss(); },
	};
}
