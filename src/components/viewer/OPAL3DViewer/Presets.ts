import type { AbstractMesh, Scene } from "@babylonjs/core";
import {
  applyProfileToMeshes,
  formatDefaultProfile,
} from "./MaterialLibrary";
import { applyRenderMode } from "./Materials";
import type {
  DentalPresetId,
  DentalViewMode,
  MaterialProfileId,
  ModelFormat,
  ViewerBackground,
  ViewerRenderMode,
  ViewerTheme,
} from "./types";

export type DentalPreset = {
  id: DentalPresetId;
  label: string;
  description: string;
  theme: ViewerTheme;
  background: ViewerBackground;
  renderMode: ViewerRenderMode;
  defaultProfile: MaterialProfileId;
  layerProfiles?: Partial<Record<string, MaterialProfileId>>;
};

export const DENTAL_PRESETS: DentalPreset[] = [
  {
    id: "dental",
    label: "Dental Default",
    description: "Bright clean studio — soft lights, always readable",
    theme: "light",
    background: "whiteStudio",
    renderMode: "shaded",
    defaultProfile: "ivory",
    layerProfiles: {
      gingiva: "gingiva",
      implant: "titanium",
      scanBodies: "scanBody",
      final: "zirconia",
      temporary: "pmma",
      stl: "ivory",
      obj: "monochrome",
      ply: "vertexColor",
    },
  },
  {
    id: "clinical",
    label: "Clinical",
    description: "Natural clinical colors",
    theme: "light",
    background: "lightGray",
    renderMode: "shaded",
    defaultProfile: "enamel",
    layerProfiles: {
      gingiva: "gingiva",
      implant: "titanium",
      scanBodies: "scanBody",
      final: "zirconia",
      temporary: "pmma",
    },
  },
  {
    id: "cad",
    label: "CAD",
    description: "Clear mesh for design work",
    theme: "light",
    background: "lightGray",
    renderMode: "shaded",
    defaultProfile: "ivory",
    layerProfiles: {
      implant: "titanium",
      scanBodies: "scanBody",
      gingiva: "gingiva",
    },
  },
  {
    id: "scan",
    label: "Scan",
    description: "Prefer vertex colors / dental scan ivory",
    theme: "light",
    background: "whiteStudio",
    renderMode: "shaded",
    defaultProfile: "vertexColor",
    layerProfiles: {
      gingiva: "gingiva",
      scanBodies: "scanBody",
      stl: "ivory",
    },
  },
  {
    id: "xray",
    label: "X-Ray",
    description: "Transparency overlay",
    theme: "dark",
    background: "darkGray",
    renderMode: "xray",
    defaultProfile: "enamel",
  },
  {
    id: "wireframe",
    label: "Wireframe",
    description: "Mesh edges",
    theme: "dark",
    background: "darkGray",
    renderMode: "wireframe",
    defaultProfile: "ivory",
  },
  {
    id: "clay",
    label: "Clay",
    description: "Matte clay review",
    theme: "light",
    background: "lightGray",
    renderMode: "shaded",
    defaultProfile: "clay",
  },
  {
    id: "monochrome",
    label: "Monochrome",
    description: "Neutral gray form study",
    theme: "light",
    background: "lightGray",
    renderMode: "shaded",
    defaultProfile: "monochrome",
  },
  {
    id: "implant",
    label: "Implant",
    description: "Highlight implants & scan bodies",
    theme: "light",
    background: "whiteStudio",
    renderMode: "shaded",
    defaultProfile: "enamel",
    layerProfiles: {
      implant: "titanium",
      scanBodies: "scanBody",
      gingiva: "gingiva",
    },
  },
];

export const VIEW_MODE_ORDER: DentalViewMode[] = [
  "dental",
  "scan",
  "cad",
  "xray",
  "wireframe",
  "clay",
  "monochrome",
];

export function viewModeToPresetId(mode: DentalViewMode): DentalPresetId {
  return mode;
}

export function applyDentalPreset(
  scene: Scene,
  items: Array<{ mesh: AbstractMesh; layer: string; format: string }>,
  presetId: DentalPresetId,
): DentalPreset {
  const preset = DENTAL_PRESETS.find((p) => p.id === presetId) ?? DENTAL_PRESETS[0];
  for (const item of items) {
    const format = item.format as ModelFormat;
    let profile: MaterialProfileId =
      preset.layerProfiles?.[item.layer] ?? preset.defaultProfile;

    // Format defaults always win for mesh files — prevents black / wrong materials
    if (preset.id === "dental" || preset.id === "clinical" || preset.id === "cad" || preset.id === "scan") {
      if (item.layer !== "gingiva" && item.layer !== "implant" && item.layer !== "scanBodies") {
        if (format === "stl" || format === "obj" || format === "ply") {
          profile = formatDefaultProfile(format);
        }
      }
    }
    if (preset.id === "scan" && format === "ply") profile = "vertexColor";
    if (preset.id === "scan" && format === "stl") profile = "ivory";
    if ((preset.id === "clay" || preset.id === "monochrome") && !preset.layerProfiles?.[item.layer]) {
      profile = preset.defaultProfile;
    }
    applyProfileToMeshes(scene, [item.mesh], profile);
  }
  applyRenderMode(
    items.map((i) => i.mesh),
    preset.renderMode,
  );
  return preset;
}
