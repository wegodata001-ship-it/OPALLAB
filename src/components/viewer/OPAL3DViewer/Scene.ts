import {
  Color4,
  Engine,
  Scene,
  SceneOptimizer,
  SceneOptimizerOptions,
  HardwareScalingOptimization,
  ShadowsOptimization,
  MergeMeshesOptimization,
  PostProcessesOptimization,
  TextureOptimization,
} from "@babylonjs/core";
import type { ViewerTheme } from "./types";

export type ViewerSceneBundle = {
  engine: Engine;
  scene: Scene;
  optimizer: SceneOptimizer | null;
};

export function createViewerScene(
  canvas: HTMLCanvasElement,
  theme: ViewerTheme,
): ViewerSceneBundle {
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    antialias: true,
    adaptToDeviceRatio: true,
    powerPreference: "high-performance",
  }, true);

  // MSAA when available
  engine.setHardwareScalingLevel(1);
  const scene = new Scene(engine);
  scene.clearColor =
    theme === "dark" ? new Color4(0.08, 0.09, 0.11, 1) : new Color4(0.93, 0.94, 0.96, 1);
  scene.autoClear = true;
  scene.skipPointerMovePicking = false;
  scene.constantlyUpdateMeshUnderPointer = false;
  scene.blockMaterialDirtyMechanism = false;

  // Prefer FXAA via default pipeline (wired in Environment)
  const optimizer = startOptimizer(scene);

  return { engine, scene, optimizer };
}

export function setSceneTheme(scene: Scene, theme: ViewerTheme): void {
  scene.clearColor =
    theme === "dark" ? new Color4(0.08, 0.09, 0.11, 1) : new Color4(0.93, 0.94, 0.96, 1);
}

export function startOptimizer(scene: Scene): SceneOptimizer {
  const opts = new SceneOptimizerOptions(50, 2000);
  opts.optimizations = [
    new HardwareScalingOptimization(0, 1.5),
    new ShadowsOptimization(1),
    new PostProcessesOptimization(2),
    new TextureOptimization(3, 512),
    new MergeMeshesOptimization(4),
  ];
  const optimizer = SceneOptimizer.OptimizeAsync(scene, opts);
  return optimizer;
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

/** Build / refresh octree for large scenes. */
export function rebuildOctree(scene: Scene): void {
  const meshes = scene.meshes.filter((m) => m.isEnabled() && m.isVisible);
  if (meshes.length < 2) return;
  try {
    scene.createOrUpdateSelectionOctree(64, 2);
  } catch {
    /* ignore */
  }
}
