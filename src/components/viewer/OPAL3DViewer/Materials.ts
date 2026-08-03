import {
  Color3,
  PBRMaterial,
  StandardMaterial,
  type AbstractMesh,
  type Material,
  type Scene,
} from "@babylonjs/core";
import type { ModelFormat, ViewerRenderMode } from "./types";

const DENTAL_ALBEDO = new Color3(0.92, 0.9, 0.86);

export function createDefaultPbr(scene: Scene, name: string): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  mat.albedoColor = DENTAL_ALBEDO.clone();
  mat.metallic = 0.05;
  mat.roughness = 0.45;
  mat.environmentIntensity = 0.7;
  mat.backFaceCulling = false;
  mat.twoSidedLighting = true;
  return mat;
}

/**
 * Apply materials per format rules.
 * PLY keeps vertex colors when present.
 */
export function applyFormatMaterials(
  meshes: AbstractMesh[],
  scene: Scene,
  format: ModelFormat,
): void {
  for (const mesh of meshes) {
    if (!mesh.getTotalVertices?.() || mesh.getTotalVertices() === 0) continue;

    const hasVertexColors = Boolean(
      mesh.getVerticesData?.("color") ||
        mesh.isVerticesDataPresent?.("color"),
    );

    if (format === "ply" && hasVertexColors) {
      // Vertex colors are sampled when COLOR buffer is present (StandardMaterial).
      const std = new StandardMaterial(`${mesh.name}_ply_vc`, scene);
      std.diffuseColor = Color3.White();
      std.specularColor = new Color3(0.1, 0.1, 0.1);
      std.backFaceCulling = false;
      std.sideOrientation = 0;
      mesh.material = std;
      continue;
    }

    if (format === "obj") {
      // Keep authored materials when present; otherwise PBR dental default
      if (mesh.material && !(mesh.material instanceof StandardMaterial && !mesh.material.diffuseTexture)) {
        if (mesh.material instanceof StandardMaterial || mesh.material instanceof PBRMaterial) {
          mesh.material.backFaceCulling = false;
          continue;
        }
      }
      if (!mesh.material) {
        mesh.material = createDefaultPbr(scene, `${mesh.name}_obj_pbr`);
      }
      continue;
    }

    // STL / GLB / GLTF / default → PBR
    if (format === "stl" || !mesh.material) {
      mesh.material = createDefaultPbr(scene, `${mesh.name}_pbr`);
    } else if (mesh.material instanceof PBRMaterial) {
      mesh.material.backFaceCulling = false;
      mesh.material.twoSidedLighting = true;
    }
  }
}

export function applyRenderMode(
  meshes: AbstractMesh[],
  mode: ViewerRenderMode,
): void {
  for (const mesh of meshes) {
    const mat = mesh.material as Material | null;
    if (!mat) continue;

    mat.wireframe = mode === "wireframe";

    if (mat instanceof PBRMaterial) {
      if (mode === "transparent" || mode === "xray") {
        mat.alpha = mode === "xray" ? 0.25 : 0.45;
        mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      } else {
        mat.alpha = 1;
        mat.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
      }
    } else if (mat instanceof StandardMaterial) {
      if (mode === "transparent" || mode === "xray") {
        mat.alpha = mode === "xray" ? 0.25 : 0.45;
        mat.transparencyMode = 2; // ALPHABLEND
      } else {
        mat.alpha = 1;
        mat.transparencyMode = 0;
      }
    }
  }
}
