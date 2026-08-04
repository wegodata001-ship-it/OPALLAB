import {
  Color3,
  Color4,
  CubeTexture,
  DefaultRenderingPipeline,
  ImageProcessingConfiguration,
  MeshBuilder,
  SSAO2RenderingPipeline,
  StandardMaterial,
  type AbstractEngine,
  type Camera,
  type Scene,
} from "@babylonjs/core";
import type { ViewerBackground } from "./types";

/** Soft dental-studio IBL (prefiltered .env). Low intensity — not a bright HDR wash. */
const DENTAL_STUDIO_ENV =
  "https://assets.babylonjs.com/environments/environmentSpecular.env";

export type EnvironmentHandle = {
  pipeline: DefaultRenderingPipeline | null;
  ssao: SSAO2RenderingPipeline | null;
  skybox: ReturnType<typeof MeshBuilder.CreateBox> | null;
  envTexture: CubeTexture | null;
  probe: null;
  background: ViewerBackground;
  envRotation: number;
  dispose: () => void;
};

const BG: Record<
  ViewerBackground,
  { clear: Color4; ambient: Color3; sky: Color3; transparent?: boolean }
> = {
  darkGray: {
    clear: new Color4(0.16, 0.17, 0.19, 1),
    ambient: new Color3(0.28, 0.29, 0.31),
    sky: new Color3(0.16, 0.17, 0.19),
  },
  lightGray: {
    clear: new Color4(0.78, 0.79, 0.81, 1),
    ambient: new Color3(0.5, 0.5, 0.52),
    sky: new Color3(0.78, 0.79, 0.81),
  },
  whiteStudio: {
    clear: new Color4(0.94, 0.945, 0.95, 1),
    ambient: new Color3(0.58, 0.58, 0.6),
    sky: new Color3(0.94, 0.945, 0.95),
  },
  gradientGray: {
    clear: new Color4(0.22, 0.23, 0.26, 1),
    ambient: new Color3(0.32, 0.33, 0.36),
    sky: new Color3(0.2, 0.21, 0.24),
  },
  transparent: {
    clear: new Color4(0, 0, 0, 0),
    ambient: new Color3(0.3, 0.3, 0.32),
    sky: new Color3(0.16, 0.17, 0.19),
    transparent: true,
  },
};

/** Auto exposure + ACES highlight compression — prevents burned whites / crushed blacks. */
function applyImageProcessing(scene: Scene, background: ViewerBackground): void {
  const ipc = scene.imageProcessingConfiguration;
  ipc.toneMappingEnabled = true;
  ipc.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  // Auto-tuned base exposure by background (ACES compresses highlights)
  if (background === "whiteStudio") ipc.exposure = 0.78;
  else if (background === "lightGray") ipc.exposure = 0.84;
  else ipc.exposure = 0.88;
  ipc.contrast = 1.02;
  ipc.vignetteEnabled = false;
  ipc.colorCurvesEnabled = false;
}

export function applyAutoExposure(scene: Scene, background: ViewerBackground = "darkGray"): void {
  applyImageProcessing(scene, background);
  scene.environmentIntensity = 0.3;
}

function setupPipeline(scene: Scene, cameras: Camera[]): DefaultRenderingPipeline | null {
  try {
    const pipeline = new DefaultRenderingPipeline("opalPremiumPipeline", true, scene, cameras);
    pipeline.samples = 4; // MSAA ×4
    pipeline.fxaaEnabled = true;
    pipeline.imageProcessingEnabled = true;
    if (pipeline.imageProcessing) {
      pipeline.imageProcessing.toneMappingEnabled = true;
      pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
      pipeline.imageProcessing.exposure = 0.88;
      pipeline.imageProcessing.contrast = 1.02;
      pipeline.imageProcessing.vignetteEnabled = false;
    }
    // Edge enhancement — subtle contour sharpen, not black outline
    pipeline.sharpenEnabled = true;
    if (pipeline.sharpen) {
      pipeline.sharpen.edgeAmount = 0.32;
      pipeline.sharpen.colorAmount = 0.12;
    }
    pipeline.bloomEnabled = false;
    pipeline.grainEnabled = false;
    pipeline.chromaticAberrationEnabled = false;
    return pipeline;
  } catch {
    return null;
  }
}

function setupSsao(scene: Scene, cameras: Camera[]): SSAO2RenderingPipeline | null {
  try {
    const ssao = new SSAO2RenderingPipeline("opalSSAO", scene, {
      ssaoRatio: 0.5,
      blurRatio: 0.5,
    }, cameras);
    // Soft crevice emphasis — never heavy black AO
    ssao.totalStrength = 0.48;
    ssao.radius = 1.05;
    ssao.expensiveBlur = true;
    ssao.samples = 16;
    ssao.maxZ = 350;
    ssao.minZAspect = 0.12;
    return ssao;
  } catch {
    return null;
  }
}

function applyBackground(scene: Scene, skybox: MeshLike | null, background: ViewerBackground): void {
  const cfg = BG[background] ?? BG.darkGray;
  scene.clearColor = cfg.clear.clone();
  scene.ambientColor = cfg.ambient.clone();
  scene.autoClear = true;
  if (skybox?.material instanceof StandardMaterial) {
    skybox.isVisible = background !== "transparent";
    skybox.setEnabled(background !== "transparent");
    if (background === "gradientGray") {
      skybox.material.emissiveColor = new Color3(0.18, 0.19, 0.22);
      skybox.material.disableLighting = true;
    } else {
      skybox.material.emissiveColor = cfg.sky.clone();
      skybox.material.disableLighting = true;
    }
  }
}

type MeshLike = ReturnType<typeof MeshBuilder.CreateBox>;

/**
 * Premium dental rendering stack — soft HDR IBL + MSAA/FXAA/ACES/SSAO/sharpen.
 * HDR load is async and safe against disposed scenes (previous black-screen crash).
 */
export function setupEnvironment(
  scene: Scene,
  background: ViewerBackground = "darkGray",
): EnvironmentHandle {
  const engine = scene.getEngine() as AbstractEngine;
  try {
    // Prefer linear workflow when available (Babylon 9+)
    const eng = engine as AbstractEngine & { setHardwareScalingLevel: (n: number) => void };
    void eng;
  } catch {
    /* ignore */
  }

  scene.environmentIntensity = 0.3;
  applyImageProcessing(scene, background);

  let skybox: MeshLike | null = null;
  try {
    skybox = MeshBuilder.CreateBox("opalSky", { size: 8000 }, scene);
    const skyMat = new StandardMaterial("opalSkyMat", scene);
    skyMat.backFaceCulling = false;
    skyMat.disableLighting = true;
    skyMat.emissiveColor = BG[background].sky.clone();
    skybox.material = skyMat;
    skybox.infiniteDistance = true;
    skybox.isPickable = false;
    skybox.ignoreCameraMaxZ = true;
    skybox.applyFog = false;
  } catch {
    skybox = null;
  }

  applyBackground(scene, skybox, background);

  const cameras = scene.cameras.length ? scene.cameras : [];
  const pipeline = setupPipeline(scene, cameras);
  const ssao = setupSsao(scene, cameras);

  const handle: EnvironmentHandle = {
    pipeline,
    ssao,
    skybox,
    envTexture: null,
    probe: null,
    background,
    envRotation: 0,
    dispose: () => {
      try {
        ssao?.dispose(true);
      } catch {
        /* ignore */
      }
      try {
        pipeline?.dispose();
      } catch {
        /* ignore */
      }
      try {
        handle.envTexture?.dispose();
      } catch {
        /* ignore */
      }
      handle.envTexture = null;
      try {
        skybox?.dispose(false, true);
      } catch {
        /* ignore */
      }
    },
  };

  // Soft dental IBL — never blow out materials
  void loadDentalHdr(scene, handle);

  return handle;
}

async function loadDentalHdr(scene: Scene, handle: EnvironmentHandle): Promise<void> {
  try {
    await new Promise<void>((resolve) => {
      // Yield a frame so engine/cameras are fully ready
      setTimeout(resolve, 0);
    });
    if (scene.isDisposed) return;

    const tex = CubeTexture.CreateFromPrefilteredData(DENTAL_STUDIO_ENV, scene);
    tex.gammaSpace = false;
    tex.level = 0.9;

    await new Promise<void>((resolve) => {
      const done = () => resolve();
      if (tex.isReady()) {
        done();
        return;
      }
      tex.onLoadObservable.addOnce(done);
      // Safety timeout — don't hang if CDN blocked
      setTimeout(done, 8000);
    });

    if (scene.isDisposed) {
      try {
        tex.dispose();
      } catch {
        /* ignore */
      }
      return;
    }

    scene.environmentTexture = tex;
    scene.environmentIntensity = 0.3;
    handle.envTexture = tex;
    tex.rotationY = handle.envRotation;

    // Unfreeze so IBL binds after async HDR arrives
    for (const mat of scene.materials) {
      try {
        mat.unfreeze();
        mat.markDirty?.();
        mat.freeze();
      } catch {
        /* ignore */
      }
    }
  } catch (err) {
    console.warn("[OPAL3DViewer] HDR environment skipped — using lights only", err);
    if (!scene.isDisposed) {
      scene.environmentTexture = null;
      scene.environmentIntensity = 0;
    }
  }
}

export function setViewerBackground(
  handle: EnvironmentHandle,
  scene: Scene,
  background: ViewerBackground,
): void {
  handle.background = background;
  applyBackground(scene, handle.skybox, background);
  applyImageProcessing(scene, background);
  scene.environmentIntensity = 0.3;
  if (handle.pipeline?.imageProcessing) {
    handle.pipeline.imageProcessing.exposure = scene.imageProcessingConfiguration.exposure;
    handle.pipeline.imageProcessing.contrast = 1.02;
  }
}

export function rotateEnvironment(handle: EnvironmentHandle, deltaRad: number): void {
  handle.envRotation += deltaRad;
  if (handle.envTexture) {
    handle.envTexture.rotationY = handle.envRotation;
  }
}

export function setEnvironmentRotation(handle: EnvironmentHandle, rad: number): void {
  handle.envRotation = rad;
  if (handle.envTexture) {
    handle.envTexture.rotationY = rad;
  }
}

/** @deprecated theme bridge — maps old dark/light to backgrounds */
export function updateEnvironmentTheme(
  handle: EnvironmentHandle,
  scene: Scene,
  theme: "dark" | "light",
): void {
  setViewerBackground(handle, scene, theme === "light" ? "lightGray" : "darkGray");
}

export function resetEnvironment(
  handle: EnvironmentHandle,
  scene: Scene,
  theme: "dark" | "light",
): void {
  updateEnvironmentTheme(handle, scene, theme);
  setEnvironmentRotation(handle, 0);
}
