import {
  ArcRotateCamera,
  Camera,
  Vector3,
  type AbstractMesh,
  type Scene,
} from "@babylonjs/core";
import type { ViewerCameraPreset, ViewerProjection } from "./types";

export function createOrbitCamera(scene: Scene, canvas: HTMLCanvasElement): ArcRotateCamera {
  const camera = new ArcRotateCamera(
    "opalCamera",
    -Math.PI / 2,
    Math.PI / 2.4,
    10,
    Vector3.Zero(),
    scene,
  );

  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 0.01;
  camera.upperRadiusLimit = 5000;
  camera.wheelPrecision = 40;
  camera.pinchPrecision = 40;
  camera.panningSensibility = 80;
  camera.angularSensibilityX = 800;
  camera.angularSensibilityY = 800;
  camera.minZ = 0.01;
  camera.maxZ = 10000;
  camera.inertia = 0.85;
  camera.panningInertia = 0.8;

  // Mouse: left rotate, right/middle pan, wheel zoom (ArcRotateCamera defaults)
  return camera;
}

export function setProjection(
  camera: ArcRotateCamera,
  mode: ViewerProjection,
): void {
  if (mode === "orthographic") {
    camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    const half = Math.max(camera.radius * 0.55, 1);
    camera.orthoLeft = -half;
    camera.orthoRight = half;
    camera.orthoTop = half;
    camera.orthoBottom = -half;
  } else {
    camera.mode = Camera.PERSPECTIVE_CAMERA;
  }
}

export function fitCameraToMeshes(
  camera: ArcRotateCamera,
  meshes: AbstractMesh[],
): void {
  const visible = meshes.filter((m) => m.getTotalVertices() > 0);
  if (!visible.length) return;

  let min = visible[0]!.getBoundingInfo().boundingBox.minimumWorld.clone();
  let max = visible[0]!.getBoundingInfo().boundingBox.maximumWorld.clone();

  for (let i = 1; i < visible.length; i++) {
    const bi = visible[i]!.getBoundingInfo().boundingBox;
    min = Vector3.Minimize(min, bi.minimumWorld);
    max = Vector3.Maximize(max, bi.maximumWorld);
  }

  const center = min.add(max).scale(0.5);
  const size = max.subtract(min);
  const radius = Math.max(size.x, size.y, size.z, 0.001) * 0.75;

  camera.setTarget(center);
  camera.radius = Math.max(radius * 2.2, 0.5);
  camera.alpha = -Math.PI / 2;
  camera.beta = Math.PI / 2.4;
  camera.lowerRadiusLimit = radius * 0.05;
  camera.upperRadiusLimit = radius * 40;

  if (camera.mode === Camera.ORTHOGRAPHIC_CAMERA) {
    setProjection(camera, "orthographic");
  }
}

export function applyCameraPreset(
  camera: ArcRotateCamera,
  preset: ViewerCameraPreset,
  meshes: AbstractMesh[],
): void {
  if (preset === "home") {
    fitCameraToMeshes(camera, meshes);
    return;
  }

  const target = camera.getTarget().clone();
  const r = camera.radius;

  const map: Record<Exclude<ViewerCameraPreset, "home">, { alpha: number; beta: number }> = {
    front: { alpha: -Math.PI / 2, beta: Math.PI / 2 },
    back: { alpha: Math.PI / 2, beta: Math.PI / 2 },
    left: { alpha: Math.PI, beta: Math.PI / 2 },
    right: { alpha: 0, beta: Math.PI / 2 },
    top: { alpha: -Math.PI / 2, beta: 0.01 },
    bottom: { alpha: -Math.PI / 2, beta: Math.PI - 0.01 },
    iso: { alpha: -Math.PI / 3.5, beta: Math.PI / 3.2 },
  };

  const pose = map[preset];
  camera.setTarget(target);
  camera.alpha = pose.alpha;
  camera.beta = pose.beta;
  camera.radius = r;
}

export function resetCamera(camera: ArcRotateCamera, meshes: AbstractMesh[]): void {
  fitCameraToMeshes(camera, meshes);
}
