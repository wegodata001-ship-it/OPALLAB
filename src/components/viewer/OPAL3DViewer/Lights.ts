import {
  Color3,
  DirectionalLight,
  HemisphericLight,
  ShadowGenerator,
  Vector3,
  type Scene,
} from "@babylonjs/core";
import type { ViewerBackground } from "./types";

export type ViewerLights = {
  hemi: HemisphericLight;
  key: DirectionalLight;
  fill: DirectionalLight;
  ambient: HemisphericLight;
  shadows: ShadowGenerator | null;
  rootAngle: number;
  /** Multiplier applied by auto exposure correction (1 = baseline). */
  boost: number;
};

/** Clean dental-studio baseline — never underexposed. */
const BASE = {
  bright: { hemi: 0.85, ambient: 0.42, key: 1.05, fill: 0.55 },
  dark: { hemi: 0.78, ambient: 0.38, key: 0.95, fill: 0.5 },
} as const;

function isBrightBg(background: ViewerBackground): boolean {
  return background === "whiteStudio" || background === "lightGray";
}

function levels(background: ViewerBackground) {
  return isBrightBg(background) ? BASE.bright : BASE.dark;
}

/**
 * Fixed clean lighting: Hemispheric + Directional (key) + Fill (+ soft ambient).
 * No dark exposure — models stay readable on every background.
 */
export function setupLights(
  scene: Scene,
  background: ViewerBackground = "whiteStudio",
): ViewerLights {
  const L = levels(background);

  const hemi = new HemisphericLight("opalHemi", new Vector3(0.15, 1, 0.1), scene);
  hemi.intensity = L.hemi;
  hemi.diffuse = new Color3(1, 0.995, 0.98);
  hemi.groundColor = new Color3(0.55, 0.56, 0.58);
  hemi.specular = new Color3(0.18, 0.18, 0.18);

  const ambient = new HemisphericLight("opalAmbient", new Vector3(0, 1, 0), scene);
  ambient.intensity = L.ambient;
  ambient.diffuse = new Color3(0.96, 0.97, 0.99);
  ambient.groundColor = new Color3(0.48, 0.49, 0.52);
  ambient.specular = Color3.Black();

  const key = new DirectionalLight("opalKey", new Vector3(-0.35, -0.85, -0.35), scene);
  key.position = new Vector3(50, 90, 45);
  key.intensity = L.key;
  key.diffuse = new Color3(1, 0.99, 0.97);
  key.specular = new Color3(0.28, 0.28, 0.26);

  const fill = new DirectionalLight("opalFill", new Vector3(0.55, -0.35, 0.4), scene);
  fill.intensity = L.fill;
  fill.diffuse = new Color3(0.92, 0.95, 1);
  fill.specular = new Color3(0.08, 0.08, 0.09);

  let shadows: ShadowGenerator | null = null;
  try {
    shadows = new ShadowGenerator(1024, key);
    shadows.useBlurExponentialShadowMap = true;
    shadows.blurKernel = 16;
    shadows.darkness = 0.18;
    shadows.bias = 0.0008;
    shadows.normalBias = 0.02;
    const sg = shadows as ShadowGenerator & { contactHardeningLightSizeUVRatio?: number };
    if (typeof sg.contactHardeningLightSizeUVRatio === "number") {
      sg.contactHardeningLightSizeUVRatio = 0.08;
    }
  } catch {
    shadows = null;
  }

  return { hemi, key, fill, ambient, shadows, rootAngle: 0, boost: 1 };
}

export function updateLightsForBackground(
  lights: ViewerLights,
  background: ViewerBackground,
): void {
  const L = levels(background);
  const b = lights.boost || 1;
  lights.hemi.intensity = L.hemi * b;
  lights.ambient.intensity = L.ambient * b;
  lights.key.intensity = L.key * b;
  lights.fill.intensity = L.fill * b;
}

/** Raise light intensities when a mesh still reads too dark. */
export function boostLights(lights: ViewerLights, factor = 1.35): void {
  const next = Math.min(2.2, (lights.boost || 1) * factor);
  const scale = next / (lights.boost || 1);
  lights.boost = next;
  lights.hemi.intensity *= scale;
  lights.ambient.intensity *= scale;
  lights.key.intensity *= scale;
  lights.fill.intensity *= scale;
}

export function resetLightBoost(
  lights: ViewerLights,
  background: ViewerBackground,
): void {
  lights.boost = 1;
  updateLightsForBackground(lights, background);
}

/** Rotate key/fill around Y — “Rotate Environment” feel for direct lights. */
export function rotateLights(lights: ViewerLights, deltaRad: number): void {
  lights.rootAngle += deltaRad;
  const a = lights.rootAngle;
  lights.key.direction = new Vector3(
    -Math.sin(a) * 0.35 - Math.cos(a) * 0.35,
    -0.85,
    -Math.cos(a) * 0.35 + Math.sin(a) * 0.35,
  );
  lights.fill.direction = new Vector3(
    Math.sin(a + 2.2) * 0.55,
    -0.35,
    Math.cos(a + 2.2) * 0.4,
  );
}

export function updateLightsForTheme(
  lights: ViewerLights,
  theme: "dark" | "light",
): void {
  updateLightsForBackground(lights, theme === "light" ? "lightGray" : "darkGray");
}

export function resetLights(lights: ViewerLights, theme: "dark" | "light"): void {
  lights.rootAngle = 0;
  lights.boost = 1;
  updateLightsForTheme(lights, theme);
  lights.key.direction = new Vector3(-0.35, -0.85, -0.35);
  lights.fill.direction = new Vector3(0.55, -0.35, 0.4);
}

export function attachMeshesToShadows(
  lights: ViewerLights,
  meshes: { receiveShadows?: boolean; isVisible: boolean }[],
): void {
  if (!lights.shadows) return;
  for (const m of meshes) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lights.shadows.addShadowCaster(m as any, true);
      m.receiveShadows = true;
    } catch {
      /* ignore */
    }
  }
}
