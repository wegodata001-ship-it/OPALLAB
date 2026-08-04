import {
  Color3,
  Color4,
  Engine,
  Scene,
  SceneOptimizer,
  SceneOptimizerOptions,
  HardwareScalingOptimization,
  ShadowsOptimization,
  TextureOptimization,
} from "@babylonjs/core";
import type { ViewerBackground, ViewerTheme } from "./types";

export type ViewerSceneBundle = {
  engine: Engine;
  scene: Scene;
  optimizer: SceneOptimizer | null;
};

const CLEAR: Record<ViewerBackground, Color4> = {
  darkGray: new Color4(0.1686, 0.1686, 0.1686, 1), // #2B2B2B
  lightGray: new Color4(0.88, 0.89, 0.91, 1),
  whiteStudio: new Color4(0.96, 0.96, 0.98, 1), // Dental Default
  gradientGray: new Color4(0.32, 0.33, 0.36, 1),
  transparent: new Color4(0, 0, 0, 0),
};

export function createViewerScene(
  canvas: HTMLCanvasElement,
  _theme: ViewerTheme = "light",
): ViewerSceneBundle {
  const engine = new Engine(
    canvas,
    true,
    {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true,
      adaptToDeviceRatio: true,
      powerPreference: "high-performance",
      premultipliedAlpha: false,
      useHighPrecisionFloats: true,
    },
    true,
  );

  // Auto hardware scaling seed — SceneOptimizer may raise this on weak GPUs
  engine.setHardwareScalingLevel(estimateGpuScale());

  const scene = new Scene(engine);
  scene.clearColor = CLEAR.whiteStudio.clone();
  scene.ambientColor = new Color3(0.62, 0.62, 0.64);
  scene.autoClear = true;
  scene.skipPointerMovePicking = false;
  scene.constantlyUpdateMeshUnderPointer = false;
  scene.blockMaterialDirtyMechanism = false;
  scene.skipFrustumClipping = false;
  scene.useRightHandedSystem = false;

  const optimizer = startOptimizer(scene);

  return { engine, scene, optimizer };
}

function estimateGpuScale(): number {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return 1;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || "").toLowerCase()
      : "";
    // Integrated / weak GPUs → slight downscale for smoothness
    if (/intel|uhd|iris|mali|adreno 5|apple gpu/.test(renderer)) return 1.15;
    if (/nvidia|radeon|geforce|rtx|gtx|apple m/.test(renderer)) return 1;
  } catch {
    /* ignore */
  }
  return 1;
}

export function setSceneTheme(scene: Scene, theme: ViewerTheme): void {
  scene.clearColor =
    theme === "dark" ? CLEAR.darkGray.clone() : CLEAR.lightGray.clone();
}

export function setSceneBackground(scene: Scene, background: ViewerBackground): void {
  scene.clearColor = (CLEAR[background] ?? CLEAR.darkGray).clone();
}

/** Conservative optimizer — no mesh merge (breaks dental materials). */
export function startOptimizer(scene: Scene): SceneOptimizer {
  const opts = new SceneOptimizerOptions(48, 2500);
  opts.optimizations = [
    new HardwareScalingOptimization(0, 1.75),
    new ShadowsOptimization(1),
    new TextureOptimization(2, 1024),
  ];
  return SceneOptimizer.OptimizeAsync(scene, opts);
}

export function disposeViewerScene(bundle: ViewerSceneBundle | null): void {
  if (!bundle) return;
  try {
    bundle.optimizer?.dispose();
  } catch {
    /* ignore */
  }
  try {
    bundle.scene.dispose();
  } catch {
    /* ignore */
  }
  try {
    bundle.engine.dispose();
  } catch {
    /* ignore */
  }
}

export function rebuildOctree(scene: Scene): void {
  const meshes = scene.meshes.filter((m) => m.isEnabled() && m.isVisible);
  if (meshes.length < 2) return;
  try {
    scene.createOrUpdateSelectionOctree(64, 2);
  } catch {
    /* ignore */
  }
}

/** Freeze active meshes after load for large dental scenes. */
export function freezeScenePerformance(scene: Scene): void {
  try {
    scene.freezeActiveMeshes();
  } catch {
    /* ignore */
  }
  try {
    scene.blockMaterialDirtyMechanism = true;
  } catch {
    /* ignore */
  }
}

export function unfreezeScenePerformance(scene: Scene): void {
  try {
    scene.unfreezeActiveMeshes();
  } catch {
    /* ignore */
  }
  try {
    scene.blockMaterialDirtyMechanism = false;
  } catch {
    /* ignore */
  }
}
