import {
  Color3,
  Material,
  PBRMaterial,
  StandardMaterial,
  VertexBuffer,
  type AbstractMesh,
  type Scene,
} from "@babylonjs/core";
import type { ModelFormat, SceneLayerId, ViewerRenderMode } from "./types";
import { LAYER_COLORS, hexToColor3Components } from "./Utils";

function colorOf(layer: SceneLayerId): Color3 {
  const [r, g, b] = hexToColor3Components(LAYER_COLORS[layer]);
  return new Color3(r, g, b);
}

export function createMaterialForMesh(
  scene: Scene,
  name: string,
  format: ModelFormat,
  layer: SceneLayerId,
  mesh: AbstractMesh,
): Material {
  const base = colorOf(layer);

  if (format === "ply" && hasVertexColors(mesh)) {
    const mat = new StandardMaterial(`${name}_ply`, scene);
    mat.diffuseColor = Color3.White();
    mat.specularColor = new Color3(0.08, 0.08, 0.08);
    mat.emissiveColor = Color3.Black();
    mat.backFaceCulling = false;
    mat.freeze();
    return mat;
  }

  if (format === "glb" || format === "gltf") {
    // Keep native materials when present
    if (mesh.material) return mesh.material;
  }

  if (format === "obj") {
    const mat = new StandardMaterial(`${name}_obj`, scene);
    mat.diffuseColor = base;
    mat.specularColor = new Color3(0.12, 0.12, 0.12);
    mat.ambientColor = base.scale(0.35);
    mat.backFaceCulling = false;
    mat.freeze();
    return mat;
  }

  // STL / default → dental PBR
  const mat = new PBRMaterial(`${name}_pbr`, scene);
  mat.albedoColor = base;
  mat.metallic = layer === "implant" ? 0.85 : 0.05;
  mat.roughness = layer === "implant" ? 0.35 : layer === "gingiva" ? 0.55 : 0.42;
  mat.environmentIntensity = 0.85;
  mat.backFaceCulling = false;
  mat.freeze();
  return mat;
}

function hasVertexColors(mesh: AbstractMesh): boolean {
  const data = mesh.getVerticesData(VertexBuffer.ColorKind);
  return !!data && data.length > 0;
}

export function applyRenderMode(meshes: AbstractMesh[], mode: ViewerRenderMode): void {
  for (const mesh of meshes) {
    const mats = collectMaterials(mesh);
    for (const mat of mats) {
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
        mat.alpha = 0.22;
        mat.transparencyMode = Material.MATERIAL_ALPHABLEND;
        if (mat instanceof PBRMaterial) {
          mat.emissiveColor = mat.albedoColor.scale(0.15);
        }
      } else {
        mat.wireframe = false;
        mat.alpha = 1;
        mat.transparencyMode = Material.MATERIAL_OPAQUE;
        if (mat instanceof PBRMaterial) {
          mat.emissiveColor = Color3.Black();
        }
      }
      mat.markAsDirty(Material.MiscDirtyFlag);
    }
  }
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
    m.setEnabled(visible);
    m.isVisible = visible;
  }
}
