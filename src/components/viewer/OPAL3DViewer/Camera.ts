import {
  ArcRotateCamera,
  ArcRotateCameraMouseWheelInput,
  ArcRotateCameraPointersInput,
  Camera,
  PointerEventTypes,
  Vector3,
  type AbstractMesh,
  type Observer,
  type Scene,
  type Nullable,
} from "@babylonjs/core";
import type { ViewerCameraPreset, ViewerProjection } from "./types";

export type SceneBounds = {
  min: Vector3;
  max: Vector3;
  center: Vector3;
  radius: number;
};

/**
 * Exocad-style orbit camera controller.
 * Pivot = center of ALL meshes. CAD mouse bindings + inertia/damping.
 */
export class CameraController {
  readonly camera: ArcRotateCamera;
  private readonly scene: Scene;
  private readonly canvas: HTMLCanvasElement;
  private pivot = Vector3.Zero();
  private fitRadius = 80;
  private projection: ViewerProjection = "perspective";
  private dblObs: Nullable<Observer<unknown>> = null;
  private keyDown: ((e: KeyboardEvent) => void) | null = null;
  private keyUp: ((e: KeyboardEvent) => void) | null = null;
  private wheelFine: ((e: WheelEvent) => void) | null = null;
  private disposed = false;

  constructor(scene: Scene, canvas: HTMLCanvasElement) {
    this.scene = scene;
    this.canvas = canvas;
    this.camera = new ArcRotateCamera(
      "opalDentalCam",
      -Math.PI / 2.35,
      Math.PI / 2.65,
      80,
      Vector3.Zero(),
      scene,
    );
    this.camera.minZ = 0.05;
    this.camera.maxZ = 100000;
    this.configureFeel();
    this.bindCadInputs();
    this.bindModifiers();
    this.bindDoubleClick();
  }

  private configureFeel(): void {
    const cam = this.camera;
    // CAD camera — orbit around scene center, damping, zoom-to-cursor
    cam.inertia = 0.92;
    cam.panningInertia = 0.9;
    cam.angularSensibilityX = 1550;
    cam.angularSensibilityY = 1550;
    cam.panningSensibility = 48;
    cam.wheelPrecision = 42;
    cam.pinchPrecision = 44;
    cam.wheelDeltaPercentage = 0.01;
    cam.useNaturalPinchZoom = true;
    cam.allowUpsideDown = false;
    cam.lowerBetaLimit = 0.05;
    cam.upperBetaLimit = Math.PI - 0.05;
    cam.lowerRadiusLimit = 0.4;
    cam.upperRadiusLimit = 8000;
    cam.panningAxis = new Vector3(1, 1, 0);
    cam.zoomToMouseLocation = true;
  }

  private bindCadInputs(): void {
    const cam = this.camera as ArcRotateCamera & {
      _panningMouseButton?: number;
      _useCtrlForPanning?: boolean;
    };
    cam.inputs.clear();

    const pointers = new ArcRotateCameraPointersInput();
    pointers.buttons = [0, 1, 2];
    cam.inputs.add(pointers);

    const wheel = new ArcRotateCameraMouseWheelInput();
    wheel.wheelPrecision = 40;
    cam.inputs.add(wheel);

    cam.attachControl(this.canvas, true);
    // Middle button pans; Ctrl+Left pans; Left rotates
    cam._panningMouseButton = 1;
    cam._useCtrlForPanning = true;
  }

  private bindModifiers(): void {
    const cam = this.camera as ArcRotateCamera & { _panningMouseButton?: number };
    // Shift + Left → Pan
    this.keyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") cam._panningMouseButton = 0;
    };
    this.keyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") cam._panningMouseButton = 1;
    };
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);

    // Ctrl + Wheel → fine zoom (override coarse wheel)
    this.wheelFine = (e: WheelEvent) => {
      if (!e.ctrlKey || this.disposed) return;
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY > 0 ? 1.02 : 0.98;
      this.camera.radius = Math.min(
        this.camera.upperRadiusLimit ?? 8000,
        Math.max(this.camera.lowerRadiusLimit ?? 0.4, this.camera.radius * factor),
      );
      this.syncOrtho();
      this.updateClipPlanes();
    };
    this.canvas.addEventListener("wheel", this.wheelFine, { passive: false, capture: true });
  }

  private bindDoubleClick(): void {
    this.dblObs = this.scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERDOUBLETAP) return;
      const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY);
      if (!pick?.hit || !pick.pickedMesh) return;
      this.focusMeshSmooth(pick.pickedMesh);
    }) as Observer<unknown>;
  }

  /**
   * Fit All — pivot on ALL meshes.
   * Default 15% margin (padding 1.15). Smooth animation by default (no jumps).
   */
  fitAll(meshes: AbstractMesh[], padding = 1.15, animate = true): void {
    const bounds = computeSceneBounds(meshes);
    if (!bounds) return;
    const target = bounds.center.clone();
    const radius = Math.max(bounds.radius * 2 * padding, 2);
    const alpha = -Math.PI / 2.35;
    const beta = Math.PI / 2.65;

    this.pivot = target.clone();
    this.fitRadius = radius;
    this.camera.inertialAlphaOffset = 0;
    this.camera.inertialBetaOffset = 0;
    this.camera.inertialRadiusOffset = 0;
    this.camera.inertialPanningX = 0;
    this.camera.inertialPanningY = 0;
    this.camera.lowerRadiusLimit = Math.max(radius * 0.04, 0.3);
    this.camera.upperRadiusLimit = radius * 12;

    if (!animate) {
      this.camera.setTarget(target.clone());
      this.camera.radius = radius;
      this.camera.alpha = alpha;
      this.camera.beta = beta;
      this.camera.rebuildAnglesAndRadius();
      this.syncOrtho();
      this.updateClipPlanes();
      return;
    }

    const cam = this.camera;
    const fromTarget = cam.target.clone();
    const fromRadius = cam.radius;
    const fromAlpha = cam.alpha;
    const fromBeta = cam.beta;
    const t0 = performance.now();
    const durationMs = 480;
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      const u = Math.min(1, (performance.now() - t0) / durationMs);
      const e = 1 - Math.pow(1 - u, 3);
      Vector3.LerpToRef(fromTarget, target, e, cam.target);
      cam.radius = fromRadius + (radius - fromRadius) * e;
      cam.alpha = fromAlpha + (alpha - fromAlpha) * e;
      cam.beta = fromBeta + (beta - fromBeta) * e;
      this.syncOrtho();
      this.updateClipPlanes();
      if (u >= 1) {
        this.scene.onBeforeRenderObservable.remove(obs);
        this.pivot = target.clone();
      }
    });
  }

  home(meshes: AbstractMesh[]): void {
    this.fitAll(meshes, 1.15, true);
  }

  resetCamera(meshes: AbstractMesh[]): void {
    this.fitAll(meshes, 1.15, true);
  }

  applyPreset(preset: ViewerCameraPreset, meshes: AbstractMesh[]): void {
    const bounds = computeSceneBounds(meshes);
    if (bounds) {
      this.pivot = bounds.center.clone();
      this.camera.setTarget(this.pivot.clone());
    } else {
      this.camera.setTarget(this.pivot.clone());
    }
    const r = this.camera.radius || this.fitRadius;

    switch (preset) {
      case "home":
        this.fitAll(meshes, 1.4);
        return;
      case "iso":
        this.camera.alpha = -Math.PI / 2.35;
        this.camera.beta = Math.PI / 2.65;
        break;
      case "top":
        this.camera.alpha = -Math.PI / 2;
        this.camera.beta = 0.08;
        break;
      case "bottom":
        this.camera.alpha = -Math.PI / 2;
        this.camera.beta = Math.PI - 0.08;
        break;
      case "front":
        this.camera.alpha = -Math.PI / 2;
        this.camera.beta = Math.PI / 2;
        break;
      case "back":
        this.camera.alpha = Math.PI / 2;
        this.camera.beta = Math.PI / 2;
        break;
      case "left":
        this.camera.alpha = Math.PI;
        this.camera.beta = Math.PI / 2;
        break;
      case "right":
        this.camera.alpha = 0;
        this.camera.beta = Math.PI / 2;
        break;
    }
    this.camera.radius = r;
    this.syncOrtho();
    this.updateClipPlanes();
  }

  setProjection(mode: ViewerProjection): void {
    this.projection = mode;
    if (mode === "orthographic") {
      this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
      this.syncOrtho();
    } else {
      this.camera.mode = Camera.PERSPECTIVE_CAMERA;
    }
  }

  private syncOrtho(): void {
    if (this.projection !== "orthographic") return;
    const r = this.camera.radius;
    const aspect =
      this.camera.getEngine().getRenderWidth() /
      Math.max(1, this.camera.getEngine().getRenderHeight());
    const half = r * 0.5;
    this.camera.orthoLeft = -half * aspect;
    this.camera.orthoRight = half * aspect;
    this.camera.orthoTop = half;
    this.camera.orthoBottom = -half;
  }

  /** Auto near/far from current radius. */
  updateClipPlanes(): void {
    const r = Math.max(this.camera.radius, 1);
    this.camera.minZ = Math.max(r * 0.001, 0.01);
    this.camera.maxZ = Math.max(r * 40, 1000);
  }

  /**
   * Smooth focus on a mesh (no jump) — lerps target + radius over ~400ms.
   */
  focusMeshSmooth(mesh: AbstractMesh, durationMs = 420): void {
    mesh.computeWorldMatrix(true);
    const bi = mesh.getBoundingInfo();
    const target = bi.boundingBox.centerWorld.clone();
    const radius = Math.max(bi.boundingBox.extendSizeWorld.length() * 2.4, 1.2);
    const cam = this.camera;
    const fromTarget = cam.target.clone();
    const fromRadius = cam.radius;
    const t0 = performance.now();
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      const u = Math.min(1, (performance.now() - t0) / durationMs);
      const e = 1 - Math.pow(1 - u, 3); // ease-out
      Vector3.LerpToRef(fromTarget, target, e, cam.target);
      cam.radius = fromRadius + (radius - fromRadius) * e;
      this.syncOrtho();
      this.updateClipPlanes();
      if (u >= 1) {
        this.scene.onBeforeRenderObservable.remove(obs);
        this.pivot = target.clone();
      }
    });
  }

  dispose(): void {
    this.disposed = true;
    if (this.dblObs) {
      this.scene.onPointerObservable.remove(this.dblObs as never);
      this.dblObs = null;
    }
    if (this.keyDown) window.removeEventListener("keydown", this.keyDown);
    if (this.keyUp) window.removeEventListener("keyup", this.keyUp);
    if (this.wheelFine) this.canvas.removeEventListener("wheel", this.wheelFine, true);
    this.camera.detachControl();
    this.camera.dispose();
  }
}

export function computeSceneBounds(meshes: AbstractMesh[]): SceneBounds | null {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  let any = false;

  for (const mesh of meshes) {
    if (!mesh.isEnabled() || !mesh.isVisible) continue;
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
  const radius = Math.max(max.subtract(min).length() * 0.5, 0.01);
  return { min, max, center, radius };
}

/** @deprecated use CameraController — kept for explode helper */
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
