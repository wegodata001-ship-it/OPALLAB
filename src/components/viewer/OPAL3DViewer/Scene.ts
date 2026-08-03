import {
  Color4,
  Engine,
  Scene,
  Vector3,
} from "@babylonjs/core";
import type { ViewerTheme } from "./types";

export type ViewerSceneBundle = {
  engine: Engine;
  scene: Scene;
  canvas: HTMLCanvasElement;
};

export function createViewerScene(
  canvas: HTMLCanvasElement,
  theme: ViewerTheme = "dark",
): ViewerSceneBundle {
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    antialias: true,
    adaptToDeviceRatio: true,
  });

  const scene = new Scene(engine);
  scene.clearColor =
    theme === "dark"
      ? new Color4(0.08, 0.09, 0.11, 1)
      : new Color4(0.94, 0.95, 0.97, 1);

  // Improves large-mesh picking / clipping stability
  scene.collisionsEnabled = false;
  scene.skipPointerMovePicking = true;
  scene.constantlyUpdateMeshUnderPointer = false;
  scene.autoClear = true;
  scene.blockMaterialDirtyMechanism = true;

  // Gentle ambient fog off — dental models need clear silhouette
  scene.fogEnabled = false;
  scene.gravity = new Vector3(0, 0, 0);

  return { engine, scene, canvas };
}

export function setSceneTheme(scene: Scene, theme: ViewerTheme): void {
  scene.clearColor =
    theme === "dark"
      ? new Color4(0.08, 0.09, 0.11, 1)
      : new Color4(0.94, 0.95, 0.97, 1);
}

export function disposeViewerScene(bundle: ViewerSceneBundle | null): void {
  if (!bundle) return;
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
