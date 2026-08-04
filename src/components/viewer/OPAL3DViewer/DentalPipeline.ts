import {
  Axis,
  Mesh,
  Space,
  TransformNode,
  type AbstractMesh,
  type Scene,
} from "@babylonjs/core";
import { computeSceneBounds, type CameraController, type SceneBounds } from "./Camera";
import type { LoadedSceneMesh } from "./Loaders";
import { applyDentalPreset } from "./Presets";
import {
  buildAssetNodes,
  registerDentalScene,
  type AssetNode,
  type RegistrationResult,
} from "./Registration";
import { freezeSceneMeshes } from "./Materials";
import { correctDarkAppearance } from "./Environment";
import { attachMeshesToShadows, type ViewerLights } from "./Lights";
import { repairDentalMesh } from "./MeshQuality";
import { freezeScenePerformance, rebuildOctree } from "./Scene";
import type { StudioFloorHandle } from "./StudioFloor";
import { syncFloorReflection } from "./StudioFloor";
import { validateDentalScene } from "./Validation";
import type { SceneAsset, SceneWarning } from "./types";

export { repairDentalMesh } from "./MeshQuality";

export type PipelinePhase =
  | "Validate File"
  | "Repair Mesh"
  | "Merge Vertices"
  | "Compute Normals"
  | "Optimize Geometry"
  | "Compute Bounding Box"
  | "Center Model"
  | "Auto Scale"
  | "Auto Orientation"
  | "Apply Dental Material"
  | "Apply HDR Studio"
  | "Fit Camera"
  | "Smooth Animation"
  | "Render Scene";

export type PipelineProgress = (phase: PipelinePhase, progress: number) => void;

export type DentalPipelineResult = {
  items: LoadedSceneMesh[];
  assetNodes: AssetNode[];
  registration: RegistrationResult;
  warnings: SceneWarning[];
  bounds: SceneBounds | null;
};

/**
 * V5 Dental Rendering Pipeline — post-load only.
 * Does NOT change file fetch / File Manager / DB.
 *
 * Critical: Center / Scale / Orient operate on the dental ROOT as one rigid body.
 * Never centers Upper/Lower/Bite individually (relative poses preserved).
 */

function validateLoadedItems(items: LoadedSceneMesh[]): LoadedSceneMesh[] {
  if (!items.length) throw new Error("No renderable geometry after load");
  // Drop broken entries instead of failing the whole scene
  const ok = items.filter((item) => (item.mesh.getTotalVertices?.() ?? 0) >= 3);
  if (!ok.length) throw new Error("No renderable geometry after load");
  return ok;
}

/**
 * Auto-orient: if Z is clearly the tall axis (common Z-up scans), tip to Y-up.
 * Applied to root only — relative poses kept.
 */
function autoOrientRoot(root: TransformNode, meshes: AbstractMesh[]): void {
  const bounds = computeSceneBounds(meshes);
  if (!bounds) return;
  const size = bounds.max.subtract(bounds.min);
  // Z-up heuristic: height along Z dominates Y
  if (size.z > size.y * 1.35 && size.z > size.x * 0.45) {
    root.rotate(Axis.X, -Math.PI / 2, Space.LOCAL);
    root.computeWorldMatrix(true);
    for (const m of meshes) {
      m.computeWorldMatrix(true);
      m.refreshBoundingInfo(true, true);
    }
  }
}

/**
 * Uniform scale on root when units look wrong (µm / m vs mm).
 * Target arch span ~60–100 scene units.
 */
function autoScaleRoot(root: TransformNode, meshes: AbstractMesh[]): void {
  const bounds = computeSceneBounds(meshes);
  if (!bounds) return;
  const dim = Math.max(
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  );
  if (!(dim > 0) || !Number.isFinite(dim)) return;

  let scale = 1;
  if (dim < 2) scale = 60 / dim; // likely meters or tiny units
  else if (dim < 8) scale = 70 / dim;
  else if (dim > 800) scale = 80 / dim; // likely µm / oversized
  else if (dim > 250) scale = 90 / dim;

  if (Math.abs(scale - 1) < 0.02) return;
  // Clamp extreme corrections
  scale = Math.min(Math.max(scale, 0.001), 1000);
  root.scaling.scaleInPlace(scale);
  root.computeWorldMatrix(true);
  for (const m of meshes) {
    m.computeWorldMatrix(true);
    m.refreshBoundingInfo(true, true);
  }
}

export async function runDentalPipeline(input: {
  scene: Scene;
  root: TransformNode;
  items: LoadedSceneMesh[];
  assets: SceneAsset[];
  camera: CameraController;
  lights: ViewerLights | null;
  floor?: StudioFloorHandle | null;
  onProgress?: PipelineProgress;
}): Promise<DentalPipelineResult> {
  const { scene, root, items, assets, camera, lights, floor, onProgress } = input;
  const report = (phase: PipelinePhase, progress: number) => onProgress?.(phase, progress);

  report("Validate File", 88);
  const validItems = validateLoadedItems(items);

  report("Repair Mesh", 89);
  for (const item of validItems) repairDentalMesh(item.mesh);

  report("Merge Vertices", 90);
  // forceSharedVertices already ran inside repair

  report("Compute Normals", 91);
  // createNormals(true) already ran

  report("Optimize Geometry", 92);
  for (const item of validItems) {
    try {
      if (item.mesh instanceof Mesh) item.mesh.optimizeIndices();
    } catch {
      /* ignore */
    }
  }

  report("Compute Bounding Box", 93);
  const meshList = validItems.map((i) => i.mesh);
  for (const m of meshList) {
    m.isVisible = true;
    m.setEnabled(true);
    m.computeWorldMatrix(true);
    m.refreshBoundingInfo(true, true);
  }

  const assetNodes = buildAssetNodes(scene, root, validItems, assets);

  report("Center Model", 94);
  // Registration: manufacturer poses OR rigid whole-scene center (never per-mesh)
  const registration = registerDentalScene({ root, items: validItems, assetNodes });

  if (registration.mode === "scene-center") {
    report("Auto Scale", 95);
    autoScaleRoot(root, meshList);
    // Re-center after scale (still rigid)
    const b = computeSceneBounds(meshList);
    if (b) {
      root.position.subtractInPlace(b.center);
      root.computeWorldMatrix(true);
      for (const m of meshList) {
        m.computeWorldMatrix(true);
        m.refreshBoundingInfo(true, true);
      }
    }

    report("Auto Orientation", 96);
    autoOrientRoot(root, meshList);
    const b2 = computeSceneBounds(meshList);
    if (b2) {
      root.position.subtractInPlace(b2.center);
      root.computeWorldMatrix(true);
      for (const m of meshList) {
        m.computeWorldMatrix(true);
        m.refreshBoundingInfo(true, true);
      }
    }
  } else {
    report("Auto Scale", 95);
    report("Auto Orientation", 96);
    // Manufacturer transforms — do not rescale / reorient (poses are source of truth)
  }

  report("Apply Dental Material", 97);
  applyDentalPreset(scene, validItems, "dental");

  report("Apply HDR Studio", 97.5);
  if (lights) attachMeshesToShadows(lights, meshList);
  correctDarkAppearance({ scene, meshes: meshList, lights });
  const boundsForFloor = computeSceneBounds(meshList);
  if (floor && boundsForFloor) {
    floor.syncSize(boundsForFloor.radius * 2);
    floor.setVisible(true);
    syncFloorReflection(floor, meshList);
  }

  report("Fit Camera", 98);
  // Seed pose instantly, then smooth Fit All (15% margin)
  camera.fitAll(meshList, 1.15, false);

  freezeSceneMeshes(meshList);
  rebuildOctree(scene);
  freezeScenePerformance(scene);

  report("Smooth Animation", 99);
  camera.fitAll(meshList, 1.15, true);

  report("Render Scene", 100);
  const warnings = validateDentalScene(validItems);
  const bounds = computeSceneBounds(meshList);

  return {
    items: validItems,
    assetNodes,
    registration,
    warnings,
    bounds,
  };
}
