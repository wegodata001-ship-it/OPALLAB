import {
  Material,
  PBRMaterial,
  type AbstractMesh,
  type Scene,
} from "@babylonjs/core";
import { createFromProfile, profileForLayer, softenExistingMaterial } from "./MaterialLibrary";
import type { ModelFormat, SceneLayerId, ViewerRenderMode } from "./types";

/**
 * Dental materials via Material Library profiles.
 */
export function createMaterialForMesh(
  scene: Scene,
  name: string,
  format: ModelFormat,
  layer: SceneLayerId,
  mesh: AbstractMesh,
): Material {
  if ((format === "glb" || format === "gltf") && mesh.material) {
    softenExistingMaterial(mesh.material);
    return mesh.material;
  }
  const profileId = profileForLayer(layer, format);
  return createFromProfile(scene, name, profileId, mesh);
}

export function applyRenderMode(meshes: AbstractMesh[], mode: ViewerRenderMode): void {
  for (const mesh of meshes) {
    const mats = collectMaterials(mesh);
    for (const mat of mats) {
      try {
        mat.unfreeze();
      } catch {
        /* ignore */
      }
      if (mode === "wireframe") {
        mat.wireframe = true;
        mat.alpha = 1;
        mat.transparencyMode = Material.MATERIAL_OPAQUE;
      } else if (mode === "transparent") {
        mat.wireframe = false;
        mat.alpha = 0.45;
        mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
      } else if (mode === "xray") {
        mat.wireframe = false;
        mat.alpha = 0.28;
        mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
        if (mat instanceof PBRMaterial) {
          mat.environmentIntensity = Math.min(mat.environmentIntensity, 0.08);
        }
      } else {
        mat.wireframe = false;
        mat.alpha = 1;
        mat.transparencyMode = Material.MATERIAL_OPAQUE;
      }
      mat.markAsDirty(Material.MiscDirtyFlag);
      try {
        mat.freeze();
      } catch {
        /* ignore */
      }
    }
  }
}

export function resetMaterialsShaded(meshes: AbstractMesh[]): void {
  applyRenderMode(meshes, "shaded");
}

function collectMaterials(mesh: AbstractMesh): Material[] {
  if (!mesh.material) return [];
  const multi = mesh.material as Material & { subMaterials?: (Material | null)[] };
  if (Array.isArray(multi.subMaterials)) {
    return multi.subMaterials.filter((m): m is Material => !!m);
  }
  return [mesh.material];
}

export function setMeshVisibility(meshes: AbstractMesh[], visible: boolean): void {
  for (const m of meshes) {
    if (m.metadata?.locked) continue;
    m.setEnabled(visible);
    m.isVisible = visible;
  }
}

export function freezeSceneMeshes(meshes: AbstractMesh[]): void {
  for (const m of meshes) {
    try {
      m.freezeWorldMatrix();
    } catch {
      /* ignore */
    }
    if (m.material) {
      try {
        m.material.freeze();
      } catch {
        /* ignore */
      }
    }
  }
}
