import type { AbstractMesh, Scene } from "@babylonjs/core";
import { applyProfileToMeshes } from "./MaterialLibrary";
import { applyRenderMode } from "./Materials";
import type {
  DentalPresetId,
  DentalViewMode,
  MaterialProfileId,
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
    label: "Dental",
    description: "Natural clinical dental look",
    theme: "dark",
    background: "darkGray",
    renderMode: "shaded",
    defaultProfile: "enamel",
    layerProfiles: {
      gingiva: "gingiva",
      implant: "titanium",
      scanBodies: "scanBody",
      final: "zirconia",
      temporary: "pmma",
      stl: "ivory",
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
    theme: "dark",
    background: "darkGray",
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
    theme: "dark",
    background: "darkGray",
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
    theme: "dark",
    background: "gradientGray",
    renderMode: "shaded",
    defaultProfile: "clay",
  },
  {
    id: "monochrome",
    label: "Monochrome",
    description: "Neutral gray form study",
    theme: "dark",
    background: "darkGray",
    renderMode: "shaded",
    defaultProfile: "monochrome",
  },
  {
    id: "implant",
    label: "Implant",
    description: "Highlight implants & scan bodies",
    theme: "dark",
    background: "darkGray",
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
    let profile: MaterialProfileId =
      preset.layerProfiles?.[item.layer] ?? preset.defaultProfile;
    if (preset.id === "scan" && item.format === "ply") profile = "vertexColor";
    if (preset.id === "scan" && item.format === "stl") profile = "ivory";
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
