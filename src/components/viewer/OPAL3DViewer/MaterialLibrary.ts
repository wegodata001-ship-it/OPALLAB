import {
  Color3,
  PBRMaterial,
  StandardMaterial,
  VertexBuffer,
  type AbstractMesh,
  type Material,
  type Scene,
} from "@babylonjs/core";
import type { MaterialProfileId, ModelFormat, SceneLayerId } from "./types";

export type MaterialProfile = {
  id: MaterialProfileId;
  label: string;
  albedo: Color3;
  metallic: number;
  roughness: number;
  /** Per-material IBL reflection (keep ≤ 0.15) */
  env: number;
  specular?: number;
};

/**
 * Premium dental materials — natural, never burned white.
 * Reflection capped; roughness tuned for Exocad / 3Shape feel.
 */
export const MATERIAL_LIBRARY: Record<MaterialProfileId, MaterialProfile> = {
  ivory: {
    id: "ivory",
    label: "Ivory Matte",
    albedo: new Color3(0.92, 0.89, 0.82),
    metallic: 0,
    roughness: 0.82,
    env: 0.1,
    specular: 0.18,
  },
  dentalScan: {
    id: "dentalScan",
    label: "Dental Ivory",
    albedo: new Color3(0.9, 0.86, 0.78),
    metallic: 0,
    roughness: 0.82,
    env: 0.1,
    specular: 0.18,
  },
  enamel: {
    id: "enamel",
    label: "Enamel",
    albedo: new Color3(0.93, 0.9, 0.85),
    metallic: 0.02,
    roughness: 0.58,
    env: 0.12,
    specular: 0.28,
  },
  gingiva: {
    id: "gingiva",
    label: "Natural Pink",
    albedo: new Color3(0.78, 0.48, 0.5),
    metallic: 0,
    roughness: 0.86,
    env: 0.08,
  },
  titanium: {
    id: "titanium",
    label: "Titanium Metallic",
    albedo: new Color3(0.68, 0.7, 0.72),
    metallic: 0.72,
    roughness: 0.38,
    env: 0.15,
  },
  zirconia: {
    id: "zirconia",
    label: "Zirconia",
    albedo: new Color3(0.93, 0.91, 0.87),
    metallic: 0.04,
    roughness: 0.42,
    env: 0.12,
  },
  pmma: {
    id: "pmma",
    label: "PMMA",
    albedo: new Color3(0.9, 0.87, 0.83),
    metallic: 0,
    roughness: 0.52,
    env: 0.1,
  },
  metal: {
    id: "metal",
    label: "Metal",
    albedo: new Color3(0.62, 0.63, 0.65),
    metallic: 0.8,
    roughness: 0.32,
    env: 0.15,
  },
  wax: {
    id: "wax",
    label: "Wax",
    albedo: new Color3(0.82, 0.7, 0.45),
    metallic: 0,
    roughness: 0.8,
    env: 0.08,
  },
  scanBody: {
    id: "scanBody",
    label: "Yellow Dental Scan Body",
    albedo: new Color3(0.9, 0.78, 0.22),
    metallic: 0.02,
    roughness: 0.72,
    env: 0.08,
  },
  clay: {
    id: "clay",
    label: "Clay",
    albedo: new Color3(0.78, 0.76, 0.74),
    metallic: 0,
    roughness: 0.92,
    env: 0.06,
  },
  monochrome: {
    id: "monochrome",
    label: "Monochrome",
    albedo: new Color3(0.78, 0.78, 0.78),
    metallic: 0,
    roughness: 0.75,
    env: 0.08,
  },
  vertexColor: {
    id: "vertexColor",
    label: "Vertex Colors",
    albedo: Color3.White(),
    metallic: 0,
    roughness: 0.7,
    env: 0.08,
  },
  default: {
    id: "default",
    label: "Default Ivory",
    albedo: new Color3(0.92, 0.89, 0.82),
    metallic: 0,
    roughness: 0.8,
    env: 0.1,
  },
};

/** Light gray for OBJ (and PLY without vertex colors). */
const LIGHT_GRAY = new Color3(0.82, 0.82, 0.84);

/**
 * Format-first material selection — never black by default.
 * STL → Ivory · OBJ → Light Gray · PLY → Vertex Colors / Light Gray
 */
export function profileForLayer(layer: SceneLayerId, format: ModelFormat): MaterialProfileId {
  if (layer === "gingiva") return "gingiva";
  if (layer === "scanBodies") return "scanBody";
  if (layer === "implant") return "titanium";
  if (layer === "temporary") return "pmma";
  if (layer === "final") return "zirconia";
  if (format === "stl") return "ivory";
  if (format === "obj") return "monochrome"; // light gray dental default for OBJ
  if (format === "ply") return "vertexColor";
  if (layer === "upper" || layer === "lower" || layer === "bite") return "enamel";
  return "ivory";
}

/** Profile id used for OBJ light-gray (alias of monochrome with brighter albedo). */
export function formatDefaultProfile(format: ModelFormat): MaterialProfileId {
  if (format === "stl") return "ivory";
  if (format === "obj") return "monochrome";
  if (format === "ply") return "vertexColor";
  return "ivory";
}

/** Premium PBR materials with capped IBL reflection (anti-burn). */
export function createFromProfile(
  scene: Scene,
  name: string,
  profileId: MaterialProfileId,
  mesh?: AbstractMesh,
): Material {
  const profile = MATERIAL_LIBRARY[profileId] ?? MATERIAL_LIBRARY.ivory;

  // PLY with vertex colors — StandardMaterial picks up ColorKind automatically
  if (profileId === "vertexColor") {
    if (mesh && hasVertexColors(mesh)) {
      const mat = new StandardMaterial(`${name}_vc`, scene);
      mat.diffuseColor = Color3.White();
      mat.specularColor = new Color3(0.1, 0.1, 0.1);
      mat.specularPower = 18;
      mat.ambientColor = new Color3(0.32, 0.32, 0.34);
      mat.emissiveColor = Color3.Black();
      mat.backFaceCulling = false;
      mat.freeze();
      return mat;
    }
    // No vertex colors → Light Gray (never black)
    return createLightGrayPbr(scene, name);
  }

  // OBJ / monochrome → explicit light gray PBR
  if (profileId === "monochrome") {
    return createLightGrayPbr(scene, name);
  }

  const mat = new PBRMaterial(`${name}_${profileId}`, scene);
  const albedo = profile.albedo.clone();
  // Guard: never ship a near-black albedo as default
  if (0.2126 * albedo.r + 0.7152 * albedo.g + 0.0722 * albedo.b < 0.12) {
    albedo.copyFrom(LIGHT_GRAY);
  }
  mat.albedoColor = albedo;
  mat.metallic = profile.metallic;
  mat.roughness = profile.roughness;
  mat.environmentIntensity = Math.min(profile.env, 0.15);
  mat.directIntensity = profile.metallic >= 0.4 ? 1.2 : 1.2;
  mat.specularIntensity = profile.specular ?? (profile.metallic >= 0.4 ? 0.42 : 0.2);
  mat.emissiveColor = Color3.Black();
  mat.backFaceCulling = false;
  mat.unlit = false;
  try {
    if ((profileId === "gingiva" || profileId === "enamel") && mat.sheen) {
      mat.sheen.isEnabled = true;
      mat.sheen.intensity = 0.08;
    }
  } catch {
    /* sheen plugin optional */
  }
  mat.freeze();
  return mat;
}

function createLightGrayPbr(scene: Scene, name: string): PBRMaterial {
  const mat = new PBRMaterial(`${name}_lightGray`, scene);
  mat.albedoColor = LIGHT_GRAY.clone();
  mat.metallic = 0;
  mat.roughness = 0.78;
  mat.environmentIntensity = 0.1;
  mat.directIntensity = 1.25;
  mat.specularIntensity = 0.18;
  mat.emissiveColor = Color3.Black();
  mat.backFaceCulling = false;
  mat.unlit = false;
  mat.freeze();
  return mat;
}

function hasVertexColors(mesh: AbstractMesh): boolean {
  const data = mesh.getVerticesData(VertexBuffer.ColorKind);
  return !!data && data.length > 0;
}

export function applyProfileToMeshes(
  scene: Scene,
  meshes: AbstractMesh[],
  profileId: MaterialProfileId,
): void {
  for (const mesh of meshes) {
    try {
      mesh.material?.unfreeze();
    } catch {
      /* ignore */
    }
    try {
      mesh.material?.dispose(false, true);
    } catch {
      /* ignore */
    }
    mesh.material = createFromProfile(scene, `${mesh.name}_prof`, profileId, mesh);
  }
}

/** Soften imported GLB PBR — clamp highlights / env. */
export function softenExistingMaterial(mat: Material): void {
  if (mat instanceof PBRMaterial) {
    mat.metallic = Math.min(mat.metallic ?? 0.2, 0.55);
    mat.roughness = Math.max(mat.roughness ?? 0.5, 0.35);
    mat.environmentIntensity = Math.min(mat.environmentIntensity ?? 0.3, 0.15);
    mat.directIntensity = Math.min(mat.directIntensity ?? 1, 1.15);
    mat.emissiveColor = Color3.Black();
    try {
      mat.freeze();
    } catch {
      /* ignore */
    }
  } else if (mat instanceof StandardMaterial) {
    mat.specularColor = new Color3(0.15, 0.15, 0.15);
    mat.emissiveColor = Color3.Black();
  }
}
