import {
  Color3,
  Color4,
  CubeTexture,
  DefaultRenderingPipeline,
  ImageProcessingConfiguration,
  Material,
  MeshBuilder,
  PBRMaterial,
  SSAO2RenderingPipeline,
  StandardMaterial,
  type AbstractEngine,
  type AbstractMesh,
  type Camera,
  type Scene,
} from "@babylonjs/core";
import { boostLights, type ViewerLights } from "./Lights";
import type { ViewerBackground } from "./types";

/** Soft dental-studio IBL (prefiltered .env). Intensity capped at 0.25. */
const DENTAL_STUDIO_ENV =
  "https://assets.babylonjs.com/environments/environmentSpecular.env";

export const HDR_INTENSITY = 0.25;
export const DEFAULT_EXPOSURE = 1.0;
export const DEFAULT_CONTRAST = 1.05;

/** Dental Default clear color — bright, clean, never pure black. */
export const DENTAL_DEFAULT_CLEAR = new Color4(0.96, 0.96, 0.98, 1);
/** Dark Gray #2B2B2B — allowed dark option, not #000. */
export const DARK_GRAY_CLEAR = new Color4(0.1686, 0.1686, 0.1686, 1);

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
    clear: DARK_GRAY_CLEAR.clone(),
    ambient: new Color3(0.38, 0.38, 0.4),
    sky: new Color3(0.1686, 0.1686, 0.1686),
  },
  lightGray: {
    clear: new Color4(0.88, 0.89, 0.91, 1),
    ambient: new Color3(0.55, 0.55, 0.57),
    sky: new Color3(0.88, 0.89, 0.91),
  },
  whiteStudio: {
    clear: DENTAL_DEFAULT_CLEAR.clone(),
    ambient: new Color3(0.62, 0.62, 0.64),
    sky: new Color3(0.96, 0.96, 0.98),
  },
  gradientGray: {
    clear: new Color4(0.32, 0.33, 0.36, 1),
    ambient: new Color3(0.4, 0.41, 0.44),
    sky: new Color3(0.3, 0.31, 0.34),
  },
  transparent: {
    clear: new Color4(0, 0, 0, 0),
    ambient: new Color3(0.4, 0.4, 0.42),
    sky: new Color3(0.96, 0.96, 0.98),
    transparent: true,
  },
};

/** Fixed image processing — exposure 1.0, contrast 1.05, ACES on. */
function applyImageProcessing(scene: Scene): void {
  const ipc = scene.imageProcessingConfiguration;
  ipc.toneMappingEnabled = true;
  ipc.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ipc.exposure = DEFAULT_EXPOSURE;
  ipc.contrast = DEFAULT_CONTRAST;
  ipc.vignetteEnabled = false;
  ipc.colorCurvesEnabled = false;
}

function syncPipelineExposure(handle: EnvironmentHandle | null | undefined, scene: Scene): void {
  if (handle?.pipeline?.imageProcessing) {
    handle.pipeline.imageProcessing.toneMappingEnabled = true;
    handle.pipeline.imageProcessing.toneMappingType =
      ImageProcessingConfiguration.TONEMAPPING_ACES;
    handle.pipeline.imageProcessing.exposure = scene.imageProcessingConfiguration.exposure;
    handle.pipeline.imageProcessing.contrast = scene.imageProcessingConfiguration.contrast;
  }
}

export function applyAutoExposure(
  scene: Scene,
  _background: ViewerBackground = "whiteStudio",
): void {
  applyImageProcessing(scene);
  scene.environmentIntensity = HDR_INTENSITY;
}

function setupPipeline(scene: Scene, cameras: Camera[]): DefaultRenderingPipeline | null {
  try {
    const pipeline = new DefaultRenderingPipeline("opalPremiumPipeline", true, scene, cameras);
    pipeline.samples = 4;
    pipeline.fxaaEnabled = true;
    pipeline.imageProcessingEnabled = true;
    if (pipeline.imageProcessing) {
      pipeline.imageProcessing.toneMappingEnabled = true;
      pipeline.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
      pipeline.imageProcessing.exposure = DEFAULT_EXPOSURE;
      pipeline.imageProcessing.contrast = DEFAULT_CONTRAST;
      pipeline.imageProcessing.vignetteEnabled = false;
    }
    pipeline.sharpenEnabled = true;
    if (pipeline.sharpen) {
      pipeline.sharpen.edgeAmount = 0.28;
      pipeline.sharpen.colorAmount = 0.1;
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
    const ssao = new SSAO2RenderingPipeline(
      "opalSSAO",
      scene,
      { ssaoRatio: 0.5, blurRatio: 0.5 },
      cameras,
    );
    // Soft crevice only — never crush into black
    ssao.totalStrength = 0.35;
    ssao.radius = 1.0;
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
  const cfg = BG[background] ?? BG.whiteStudio;
  // Never use pure black clear
  const clear = cfg.clear.clone();
  if (clear.r + clear.g + clear.b < 0.05 && clear.a > 0.5) {
    clear.copyFrom(DARK_GRAY_CLEAR);
  }
  scene.clearColor = clear;
  scene.ambientColor = cfg.ambient.clone();
  scene.autoClear = true;
  if (skybox?.material instanceof StandardMaterial) {
    skybox.isVisible = background !== "transparent";
    skybox.setEnabled(background !== "transparent");
    if (background === "gradientGray") {
      skybox.material.emissiveColor = new Color3(0.28, 0.29, 0.32);
      skybox.material.disableLighting = true;
    } else {
      skybox.material.emissiveColor = cfg.sky.clone();
      skybox.material.disableLighting = true;
    }
  }
}

type MeshLike = ReturnType<typeof MeshBuilder.CreateBox>;

/**
 * Premium dental rendering stack — soft HDR IBL + MSAA/FXAA/ACES/SSAO.
 * Default: Dental bright studio (never black models / black backdrop).
 */
export function setupEnvironment(
  scene: Scene,
  background: ViewerBackground = "whiteStudio",
): EnvironmentHandle {
  const engine = scene.getEngine() as AbstractEngine;
  try {
    const eng = engine as AbstractEngine & { setHardwareScalingLevel: (n: number) => void };
    void eng;
  } catch {
    /* ignore */
  }

  scene.environmentIntensity = HDR_INTENSITY;
  applyImageProcessing(scene);

  let skybox: MeshLike | null = null;
  try {
    skybox = MeshBuilder.CreateBox("opalSky", { size: 8000 }, scene);
    const skyMat = new StandardMaterial("opalSkyMat", scene);
    skyMat.backFaceCulling = false;
    skyMat.disableLighting = true;
    skyMat.emissiveColor = (BG[background] ?? BG.whiteStudio).sky.clone();
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

  void loadDentalHdr(scene, handle);

  return handle;
}

async function loadDentalHdr(scene: Scene, handle: EnvironmentHandle): Promise<void> {
  try {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    if (scene.isDisposed) return;

    const tex = CubeTexture.CreateFromPrefilteredData(DENTAL_STUDIO_ENV, scene);
    tex.gammaSpace = false;
    tex.level = 0.85;

    await new Promise<void>((resolve) => {
      const done = () => resolve();
      if (tex.isReady()) {
        done();
        return;
      }
      tex.onLoadObservable.addOnce(done);
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
    scene.environmentIntensity = HDR_INTENSITY;
    handle.envTexture = tex;
    tex.rotationY = handle.envRotation;

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
  applyImageProcessing(scene);
  scene.environmentIntensity = HDR_INTENSITY;
  syncPipelineExposure(handle, scene);
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

function albedoLuminance(mat: Material): number | null {
  if (mat instanceof PBRMaterial) {
    const c = mat.albedoColor;
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  }
  if (mat instanceof StandardMaterial) {
    const c = mat.diffuseColor;
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  }
  return null;
}

function liftDarkMaterial(mat: Material): boolean {
  const FALLBACK = new Color3(0.82, 0.82, 0.84); // light gray — never black
  let lifted = false;
  try {
    mat.unfreeze();
  } catch {
    /* ignore */
  }
  if (mat instanceof PBRMaterial) {
    const lum = albedoLuminance(mat);
    if (lum != null && lum < 0.12) {
      mat.albedoColor = FALLBACK.clone();
      lifted = true;
    }
    if ((mat.metallic ?? 0) > 0.85 && (mat.roughness ?? 0.5) < 0.2) {
      mat.roughness = 0.35;
      lifted = true;
    }
    mat.environmentIntensity = Math.min(Math.max(mat.environmentIntensity ?? 0.1, 0.08), 0.18);
    mat.directIntensity = Math.max(mat.directIntensity ?? 1, 1.15);
    mat.emissiveColor = Color3.Black();
  } else if (mat instanceof StandardMaterial) {
    const lum = albedoLuminance(mat);
    if (lum != null && lum < 0.12) {
      mat.diffuseColor = FALLBACK.clone();
      mat.ambientColor = new Color3(0.28, 0.28, 0.3);
      lifted = true;
    }
    mat.emissiveColor = Color3.Black();
  }
  try {
    mat.markAsDirty(Material.AllDirtyFlag);
    mat.freeze();
  } catch {
    /* ignore */
  }
  return lifted;
}

/**
 * Auto Exposure Correction — if models still read dark, lift albedos + boost lights/exposure.
 * Call after materials + HDR are applied.
 */
export function correctDarkAppearance(opts: {
  scene: Scene;
  meshes: AbstractMesh[];
  lights?: ViewerLights | null;
  env?: EnvironmentHandle | null;
}): void {
  const { scene, meshes, lights, env } = opts;
  applyImageProcessing(scene);
  scene.environmentIntensity = HDR_INTENSITY;

  let darkCount = 0;
  for (const mesh of meshes) {
    const mat = mesh.material;
    if (!mat) continue;
    const multi = mat as Material & { subMaterials?: (Material | null)[] };
    const list = Array.isArray(multi.subMaterials)
      ? multi.subMaterials.filter((m): m is Material => !!m)
      : [mat];
    for (const m of list) {
      if (liftDarkMaterial(m)) darkCount++;
      else {
        const lum = albedoLuminance(m);
        if (lum != null && lum < 0.28) darkCount++;
      }
    }
  }

  if (darkCount > 0) {
    // Mild exposure lift + stronger lights — keep ACES, avoid burn
    scene.imageProcessingConfiguration.exposure = Math.min(1.25, DEFAULT_EXPOSURE * 1.12);
    scene.imageProcessingConfiguration.contrast = DEFAULT_CONTRAST;
    if (lights) boostLights(lights, 1.3);
  }

  syncPipelineExposure(env, scene);
}
