/**
 * OPAL LAB Dental 3D Viewer engine — Exocad-inspired rendering stack on Three.js.
 * PBR + RoomEnvironment IBL + SSAO + FXAA + ACES tone mapping.
 */

export type ViewerQuality = "auto" | "high" | "medium" | "low";
export type ViewerBackground = "dark" | "light" | "transparent" | "gradient";
export type ViewerLighting = "studio" | "dental" | "soft" | "strong" | "daylight";
export type ViewerShade =
  | "solid"
  | "wireframe"
  | "transparent"
  | "xray"
  | "monochrome"
  | "original";
export type CameraPreset =
  | "front"
  | "back"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "isometric"
  | "reset";

export type ViewerMeshNode = {
  id: string;
  name: string;
  role: string;
  visible: boolean;
  triangles: number;
  vertices: number;
};

type THREE = typeof import("three");

export type DentalViewerEngine = {
  dispose: () => void;
  resize: (w: number, h: number) => void;
  renderFrame: () => void;
  setAutoRotate: (on: boolean) => void;
  setBackground: (bg: ViewerBackground) => void;
  setLighting: (preset: ViewerLighting) => void;
  setQuality: (q: ViewerQuality) => void;
  setShade: (mode: ViewerShade) => void;
  setCameraPreset: (preset: CameraPreset) => void;
  setOrthographic: (on: boolean) => void;
  fitToView: () => void;
  centerModel: () => void;
  zoomBy: (factor: number) => void;
  setMeshVisible: (id: string, visible: boolean) => void;
  isolateMesh: (id: string | null) => void;
  showAllMeshes: () => void;
  captureScreenshot: (opts?: {
    format?: "png" | "jpeg";
    transparent?: boolean;
  }) => string;
  getFps: () => number;
  getMeshes: () => ViewerMeshNode[];
  getMaxDim: () => number;
};

// three is ambient-typed in this repo — use loose object handles.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any;

type MeshEntry = {
  id: string;
  name: string;
  role: string;
  object: AnyObj;
  mesh: AnyObj;
  triangles: number;
  vertices: number;
  originalColor: number;
  originalMap: AnyObj | null;
  hasVertexColors: boolean;
};

export async function createDentalViewerEngine(opts: {
  canvasParent: HTMLElement;
  width: number;
  height: number;
}): Promise<{
  engine: DentalViewerEngine;
  THREE: THREE;
  addGeometryGroup: (input: {
    id: string;
    name: string;
    role: string;
    positions: Float32Array;
    normals: Float32Array | null;
    colors: Float32Array | null;
    indices: Uint32Array | null;
    center: [number, number, number];
    maxDim: number;
    hasVertexColors: boolean;
  }) => void;
  addObject3D: (input: {
    id: string;
    name: string;
    role: string;
    object: AnyObj;
  }) => void;
  finalizeScene: () => void;
}> {
  const THREE = await import("three");
  const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
  const { RoomEnvironment } = await import(
    "three/examples/jsm/environments/RoomEnvironment.js"
  );
  const { EffectComposer } = await import(
    "three/examples/jsm/postprocessing/EffectComposer.js"
  );
  const { RenderPass } = await import("three/examples/jsm/postprocessing/RenderPass.js");
  const { SSAOPass } = await import("three/examples/jsm/postprocessing/SSAOPass.js");
  const { OutputPass } = await import("three/examples/jsm/postprocessing/OutputPass.js");
  const { ShaderPass } = await import("three/examples/jsm/postprocessing/ShaderPass.js");
  const { FXAAShader } = await import("three/examples/jsm/shaders/FXAAShader.js");

  const { width, height, canvasParent } = opts;

  const scene = new THREE.Scene();
  const perspective = new THREE.PerspectiveCamera(40, width / height, 0.01, 500000);
  const orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 500000);
  let activeCamera: AnyObj = perspective;
  let useOrtho = false;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvasParent.innerHTML = "";
  canvasParent.appendChild(renderer.domElement);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  scene.background = new THREE.Color(0x0b1220);

  const hemi = new THREE.HemisphereLight(0xf0f4ff, 0x2a2118, 0.45);
  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  key.position.set(2.2, 3.2, 1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.00015;
  const fill = new THREE.DirectionalLight(0xdde7ff, 0.55);
  fill.position.set(-2.4, 1.2, -1.5);
  const rim = new THREE.DirectionalLight(0xfff1d6, 0.35);
  rim.position.set(0.2, 1.8, -2.8);
  scene.add(hemi, key, fill, rim);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShadowMaterial({ opacity: 0.18 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.visible = false;
  scene.add(ground);

  const root = new THREE.Group();
  scene.add(root);

  const controls = new OrbitControls(perspective, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.85;
  controls.panSpeed = 0.7;
  controls.zoomSpeed = 1.05;
  controls.minDistance = 0.01;
  controls.maxDistance = 1e6;

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, perspective);
  composer.addPass(renderPass);
  const ssaoPass = new SSAOPass(scene, perspective, width, height);
  ssaoPass.kernelRadius = 12;
  ssaoPass.minDistance = 0.001;
  ssaoPass.maxDistance = 0.12;
  composer.addPass(ssaoPass);
  const fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.material.uniforms["resolution"].value.set(1 / width, 1 / height);
  composer.addPass(fxaaPass);
  composer.addPass(new OutputPass());

  const meshes: MeshEntry[] = [];
  let maxDim = 1;
  let quality: ViewerQuality = "auto";
  let shade: ViewerShade = "original";
  let bg: ViewerBackground = "dark";
  let lighting: ViewerLighting = "dental";
  let isolatedId: string | null = null;
  let frames = 0;
  let fps = 0;
  let lastFpsTs = performance.now();

  const dentalGold = 0xc9a227;

  function syncComposerCamera() {
    renderPass.camera = activeCamera;
    ssaoPass.camera = activeCamera;
  }

  function applyQuality() {
    const dpr = window.devicePixelRatio || 1;
    let pr = dpr;
    let ssao = true;
    if (quality === "high") pr = Math.min(dpr, 2.5);
    else if (quality === "medium") pr = Math.min(dpr, 1.5);
    else if (quality === "low") {
      pr = 1;
      ssao = false;
    } else {
      pr = Math.min(dpr, 2);
    }
    renderer.setPixelRatio(pr);
    ssaoPass.enabled = ssao;
    fxaaPass.enabled = quality !== "low";
  }

  function applyLighting() {
    const map: Record<ViewerLighting, [number, number, number, number, number]> = {
      studio: [0.35, 1.1, 0.45, 0.25, 1.0],
      dental: [0.45, 1.35, 0.55, 0.35, 1.05],
      soft: [0.7, 0.7, 0.4, 0.2, 0.9],
      strong: [0.25, 1.9, 0.7, 0.5, 1.2],
      daylight: [0.55, 1.2, 0.65, 0.3, 1.1],
    };
    const [h, k, f, r, exp] = map[lighting];
    hemi.intensity = h;
    key.intensity = k;
    fill.intensity = f;
    rim.intensity = r;
    renderer.toneMappingExposure = exp;
    scene.environmentIntensity = lighting === "soft" ? 0.7 : lighting === "strong" ? 1.25 : 1;
  }

  function applyBackground() {
    if (bg === "transparent") {
      scene.background = null;
      renderer.setClearColor(0x000000, 0);
      ground.visible = false;
      return;
    }
    renderer.setClearColor(0x000000, 1);
    if (bg === "light") {
      scene.background = new THREE.Color(0xf1f5f9);
      ground.visible = true;
    } else if (bg === "gradient") {
      const c = document.createElement("canvas");
      c.width = 4;
      c.height = 256;
      const ctx = c.getContext("2d")!;
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, "#1e293b");
      g.addColorStop(1, "#0b1220");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 4, 256);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      scene.background = tex;
      ground.visible = false;
    } else {
      scene.background = new THREE.Color(0x0b1220);
      ground.visible = false;
    }
  }

  function applyShadeToMesh(entry: MeshEntry) {
    const mats = Array.isArray(entry.mesh.material)
      ? entry.mesh.material
      : [entry.mesh.material];
    for (const mat of mats) {
      if (!mat) continue;
      mat.wireframe = shade === "wireframe";
      mat.transparent = shade === "transparent" || shade === "xray";
      mat.opacity = shade === "xray" ? 0.28 : shade === "transparent" ? 0.55 : 1;
      mat.depthWrite = shade !== "xray" && shade !== "transparent";
      mat.side = THREE.DoubleSide;
      if (shade === "monochrome") {
        mat.vertexColors = false;
        mat.color?.setHex?.(0xb8c0cc);
        mat.map = null;
      } else if (shade === "solid") {
        mat.vertexColors = false;
        mat.color?.setHex?.(dentalGold);
        mat.map = null;
      } else {
        // original / transparent / xray / wireframe keep albedo when present
        mat.vertexColors = entry.hasVertexColors;
        if (entry.originalMap) {
          mat.map = entry.originalMap;
          mat.color?.setHex?.(0xffffff);
        } else {
          mat.map = null;
          mat.color?.setHex?.(entry.hasVertexColors ? 0xffffff : entry.originalColor);
        }
      }
      mat.needsUpdate = true;
    }
  }

  function applyShade() {
    for (const m of meshes) applyShadeToMesh(m);
  }

  function fitCamera(preset: CameraPreset = "isometric") {
    const dist = maxDim * 2.1;
    const map: Record<CameraPreset, [number, number, number]> = {
      front: [0, 0, dist],
      back: [0, 0, -dist],
      left: [-dist, 0, 0],
      right: [dist, 0, 0],
      top: [0, dist, 0.001],
      bottom: [0, -dist, 0.001],
      isometric: [dist * 0.85, dist * 0.7, dist * 0.95],
      reset: [dist * 0.85, dist * 0.7, dist * 0.95],
    };
    const [x, y, z] = map[preset];
    perspective.position.set(x, y, z);
    orthographic.position.set(x, y, z);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  function updateOrthoFrustum(w: number, h: number) {
    const aspect = w / h;
    const fr = maxDim * 1.25;
    orthographic.left = (-fr * aspect) / 2;
    orthographic.right = (fr * aspect) / 2;
    orthographic.top = fr / 2;
    orthographic.bottom = -fr / 2;
    orthographic.updateProjectionMatrix();
  }

  function addGeometryGroup(input: {
    id: string;
    name: string;
    role: string;
    positions: Float32Array;
    normals: Float32Array | null;
    colors: Float32Array | null;
    indices: Uint32Array | null;
    center: [number, number, number];
    maxDim: number;
    hasVertexColors: boolean;
  }) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(input.positions, 3));
    if (input.normals) {
      geometry.setAttribute("normal", new THREE.BufferAttribute(input.normals, 3));
    } else {
      geometry.computeVertexNormals();
    }
    if (input.colors) {
      geometry.setAttribute("color", new THREE.BufferAttribute(input.colors, 3));
    }
    if (input.indices) {
      geometry.setIndex(new THREE.BufferAttribute(input.indices, 1));
    }

    const material = new THREE.MeshStandardMaterial({
      color: input.hasVertexColors ? 0xffffff : dentalGold,
      vertexColors: input.hasVertexColors,
      metalness: 0.08,
      roughness: 0.42,
      envMapIntensity: 1.1,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(-input.center[0], -input.center[1], -input.center[2]);

    const group = new THREE.Group();
    group.name = input.name;
    group.add(mesh);
    root.add(group);

    const verts = input.positions.length / 3;
    const tris = input.indices ? input.indices.length / 3 : verts / 3;
    meshes.push({
      id: input.id,
      name: input.name,
      role: input.role,
      object: group,
      mesh,
      triangles: Math.round(tris),
      vertices: Math.round(verts),
      originalColor: dentalGold,
      originalMap: null,
      hasVertexColors: input.hasVertexColors,
    });
    maxDim = Math.max(maxDim, input.maxDim || 1);
  }

  function addObject3D(input: {
    id: string;
    name: string;
    role: string;
    object: AnyObj;
  }) {
    const box = new THREE.Box3().setFromObject(input.object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    input.object.position.sub(center);

    const group = new THREE.Group();
    group.name = input.name;
    group.add(input.object);
    root.add(group);

    let meshIndex = 0;
    input.object.traverse((child: AnyObj) => {
      if (!child.isMesh || !child.geometry) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (m?.isMeshStandardMaterial || m?.isMeshPhysicalMaterial) {
          m.envMapIntensity = m.envMapIntensity ?? 1.1;
          m.roughness = Math.min(m.roughness ?? 0.5, 0.55);
        }
      }
      const primary = mats[0];
      const pos = child.geometry.getAttribute("position");
      const idx = child.geometry.getIndex();
      const verts = pos?.count ?? 0;
      const tris = idx ? idx.count / 3 : verts / 3;
      const partName = child.name || `${input.name}${meshIndex ? ` · ${meshIndex + 1}` : ""}`;
      const partId = meshIndex === 0 ? input.id : `${input.id}::${meshIndex}`;
      meshes.push({
        id: partId,
        name: partName,
        role: input.role,
        object: child,
        mesh: child,
        triangles: Math.round(tris),
        vertices: Math.round(verts),
        originalColor: primary?.color?.getHex?.() ?? dentalGold,
        originalMap: primary?.map ?? null,
        hasVertexColors: Boolean(child.geometry.getAttribute("color")),
      });
      meshIndex += 1;
    });

    if (meshIndex === 0) {
      meshes.push({
        id: input.id,
        name: input.name,
        role: input.role,
        object: group,
        mesh: new THREE.Mesh(),
        triangles: 0,
        vertices: 0,
        originalColor: dentalGold,
        originalMap: null,
        hasVertexColors: false,
      });
    }

    maxDim = Math.max(maxDim, Math.max(size.x, size.y, size.z) || 1);
  }

  function finalizeScene() {
    ground.scale.setScalar(maxDim * 8);
    ground.position.y = -maxDim * 0.02;
    key.shadow.camera.left = -maxDim * 2;
    key.shadow.camera.right = maxDim * 2;
    key.shadow.camera.top = maxDim * 2;
    key.shadow.camera.bottom = -maxDim * 2;
    key.shadow.camera.updateProjectionMatrix();
    updateOrthoFrustum(width, height);
    applyLighting();
    applyBackground();
    applyQuality();
    applyShade();
    fitCamera("isometric");
  }

  const engine: DentalViewerEngine = {
    dispose() {
      composer.dispose();
      envRT.dispose();
      pmrem.dispose();
      renderer.dispose();
      for (const m of meshes) {
        m.mesh.geometry?.dispose();
        const mat = m.mesh.material;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      }
      canvasParent.innerHTML = "";
    },
    resize(w, h) {
      if (w < 2 || h < 2) return;
      perspective.aspect = w / h;
      perspective.updateProjectionMatrix();
      updateOrthoFrustum(w, h);
      renderer.setSize(w, h);
      composer.setSize(w, h);
      ssaoPass.setSize(w, h);
      fxaaPass.material.uniforms["resolution"].value.set(1 / w, 1 / h);
    },
    renderFrame() {
      controls.update();
      frames += 1;
      const now = performance.now();
      if (now - lastFpsTs >= 500) {
        fps = Math.round((frames * 1000) / (now - lastFpsTs));
        frames = 0;
        lastFpsTs = now;
      }
      composer.render();
    },
    setAutoRotate(on) {
      controls.autoRotate = on;
      controls.autoRotateSpeed = 1.4;
    },
    setBackground(next) {
      bg = next;
      applyBackground();
    },
    setLighting(next) {
      lighting = next;
      applyLighting();
    },
    setQuality(next) {
      quality = next;
      applyQuality();
    },
    setShade(next) {
      shade = next;
      applyShade();
    },
    setCameraPreset(preset) {
      fitCamera(preset);
    },
    setOrthographic(on) {
      useOrtho = on;
      activeCamera = on ? orthographic : perspective;
      controls.object = activeCamera;
      syncComposerCamera();
      controls.update();
    },
    fitToView() {
      fitCamera("isometric");
    },
    centerModel() {
      controls.target.set(0, 0, 0);
      controls.update();
    },
    zoomBy(factor) {
      activeCamera.position.multiplyScalar(factor);
      controls.update();
    },
    setMeshVisible(id, visible) {
      const m = meshes.find((x) => x.id === id);
      if (m) m.object.visible = visible;
    },
    isolateMesh(id) {
      isolatedId = id;
      for (const m of meshes) {
        m.object.visible = id == null ? true : m.id === id;
      }
    },
    showAllMeshes() {
      isolatedId = null;
      for (const m of meshes) m.object.visible = true;
    },
    captureScreenshot(opts) {
      const format = opts?.format ?? "png";
      const transparent = Boolean(opts?.transparent);
      const prevBg = scene.background;
      if (transparent) {
        scene.background = null;
        renderer.setClearColor(0x000000, 0);
        renderer.render(scene, activeCamera);
      } else {
        composer.render();
      }
      const data = renderer.domElement.toDataURL(
        format === "jpeg" ? "image/jpeg" : "image/png",
        0.92,
      );
      scene.background = prevBg;
      applyBackground();
      return data;
    },
    getFps: () => fps,
    getMeshes: () =>
      meshes.map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        visible: m.object.visible,
        triangles: m.triangles,
        vertices: m.vertices,
      })),
    getMaxDim: () => maxDim,
  };

  return {
    engine,
    THREE,
    addGeometryGroup,
    addObject3D,
    finalizeScene,
  };
}
