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
    "opalDentalCam",
    -Math.PI / 2,
    Math.PI / 2.6,
    80,
    Vector3.Zero(),
    scene,
  );
  camera.lowerRadiusLimit = 0.5;
  camera.upperRadiusLimit = 5000;
  camera.wheelPrecision = 40;
  camera.pinchPrecision = 40;
  camera.panningSensibility = 80;
  camera.minZ = 0.1;
  camera.maxZ = 100000;
  camera.inertia = 0.85;
  camera.panningInertia = 0.8;
  camera.attachControl(canvas, true);
  // Left = rotate, Right/Middle = pan, Wheel = zoom (Exocad-like)
  camera.inputs.clear();
  // Re-attach defaults then tweak
  camera.attachControl(canvas, true);
  camera.useNaturalPinchZoom = true;
  return camera;
}

export function computeSceneBounds(meshes: AbstractMesh[]): {
  min: Vector3;
  max: Vector3;
  center: Vector3;
  radius: number;
} | null {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  let any = false;

  for (const mesh of meshes) {
    if (!mesh.getBoundingInfo) continue;
    mesh.computeWorldMatrix(true);
    const bi = mesh.getBoundingInfo();
    const min = bi.boundingBox.minimumWorld;
    const max = bi.boundingBox.maximumWorld;
    if (!Number.isFinite(min.x) || !Number.isFinite(max.x)) continue;
    any = true;
    minX = Math.min(minX, min.x);
    minY = Math.min(minY, min.y);
    minZ = Math.min(minZ, min.z);
    maxX = Math.max(maxX, max.x);
    maxY = Math.max(maxY, max.y);
    maxZ = Math.max(maxZ, max.z);
  }
  if (!any) return null;
  const min = new Vector3(minX, minY, minZ);
  const max = new Vector3(maxX, maxY, maxZ);
  const center = min.add(max).scale(0.5);
  const radius = max.subtract(min).length() * 0.5 || 1;
  return { min, max, center, radius };
}

/** Center meshes around origin and normalize scale for dental viewing. */
export function centerAndScaleScene(meshes: AbstractMesh[]): void {
  const bounds = computeSceneBounds(meshes);
  if (!bounds) return;
  const { center, radius } = bounds;
  const targetSize = 60;
  const scale = radius > 0 ? targetSize / radius : 1;
  for (const mesh of meshes) {
    mesh.position.subtractInPlace(center);
    if (Math.abs(scale - 1) > 0.001) {
      mesh.scaling.scaleInPlace(scale);
    }
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo(true, true);
  }
}

export function fitCameraToMeshes(
  camera: ArcRotateCamera,
  meshes: AbstractMesh[],
  padding = 1.35,
): void {
  const bounds = computeSceneBounds(meshes);
  if (!bounds) return;
  camera.setTarget(bounds.center.clone());
  const dia = Math.max(bounds.radius * 2, 1);
  camera.radius = dia * padding;
  camera.alpha = -Math.PI / 2;
  camera.beta = Math.PI / 2.55;
  camera.rebuildAnglesAndRadius();
}

export function resetCamera(camera: ArcRotateCamera, meshes: AbstractMesh[]): void {
  fitCameraToMeshes(camera, meshes, 1.35);
}

export function setProjection(camera: ArcRotateCamera, mode: ViewerProjection): void {
  if (mode === "orthographic") {
    camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    const r = camera.radius;
    const aspect =
      camera.getEngine().getRenderWidth() / Math.max(1, camera.getEngine().getRenderHeight());
    const half = r * 0.55;
    camera.orthoLeft = -half * aspect;
    camera.orthoRight = half * aspect;
    camera.orthoTop = half;
    camera.orthoBottom = -half;
  } else {
    camera.mode = Camera.PERSPECTIVE_CAMERA;
  }
}

export function applyCameraPreset(
  camera: ArcRotateCamera,
  preset: ViewerCameraPreset,
  meshes: AbstractMesh[],
): void {
  const bounds = computeSceneBounds(meshes);
  if (bounds) camera.setTarget(bounds.center.clone());
  const r = camera.radius || 80;

  switch (preset) {
    case "home":
    case "iso":
      camera.alpha = -Math.PI / 2.4;
      camera.beta = Math.PI / 2.7;
      break;
    case "top":
      camera.alpha = -Math.PI / 2;
      camera.beta = 0.01;
      break;
    case "bottom":
      camera.alpha = -Math.PI / 2;
      camera.beta = Math.PI - 0.01;
      break;
    case "front":
      camera.alpha = -Math.PI / 2;
      camera.beta = Math.PI / 2;
      break;
    case "back":
      camera.alpha = Math.PI / 2;
      camera.beta = Math.PI / 2;
      break;
    case "left":
      camera.alpha = Math.PI;
      camera.beta = Math.PI / 2;
      break;
    case "right":
      camera.alpha = 0;
      camera.beta = Math.PI / 2;
      break;
  }
  camera.radius = r;
  if (preset === "home") fitCameraToMeshes(camera, meshes, 1.35);
}

/** Explode meshes slightly along outward normals from scene center. */
export function setExplodeFactor(meshes: AbstractMesh[], factor: number): void {
  const bounds = computeSceneBounds(meshes);
  if (!bounds) return;
  for (const mesh of meshes) {
    const c = mesh.getBoundingInfo().boundingBox.centerWorld;
    const dir = c.subtract(bounds.center);
    if (dir.lengthSquared() < 1e-8) continue;
    dir.normalize();
    const base = (mesh.metadata?.basePosition as Vector3 | undefined) ?? mesh.position.clone();
    if (!mesh.metadata) mesh.metadata = {};
    if (!mesh.metadata.basePosition) mesh.metadata.basePosition = base.clone();
    mesh.position.copyFrom(base.add(dir.scale(factor * bounds.radius * 0.35)));
  }
}
