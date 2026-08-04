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
};

/**
 * Soft dental-studio lights — complement low-intensity IBL.
 * Contact-like soft shadows on key light (gentle, not harsh).
 */
export function setupLights(
  scene: Scene,
  background: ViewerBackground = "darkGray",
): ViewerLights {
  const bright = background === "whiteStudio" || background === "lightGray";

  const hemi = new HemisphericLight("opalHemi", new Vector3(0.15, 1, 0.1), scene);
  hemi.intensity = bright ? 0.55 : 0.48;
  hemi.diffuse = new Color3(1, 0.99, 0.97);
  hemi.groundColor = new Color3(0.42, 0.43, 0.46);
  hemi.specular = new Color3(0.12, 0.12, 0.12);

  const ambient = new HemisphericLight("opalAmbient", new Vector3(0, 1, 0), scene);
  ambient.intensity = bright ? 0.28 : 0.22;
  ambient.diffuse = new Color3(0.94, 0.95, 0.97);
  ambient.groundColor = new Color3(0.35, 0.36, 0.38);
  ambient.specular = Color3.Black();

  const key = new DirectionalLight("opalKey", new Vector3(-0.35, -0.85, -0.35), scene);
  key.position = new Vector3(50, 90, 45);
  key.intensity = bright ? 0.7 : 0.62;
  key.diffuse = new Color3(1, 0.985, 0.96);
  key.specular = new Color3(0.22, 0.22, 0.2);

  const fill = new DirectionalLight("opalFill", new Vector3(0.55, -0.35, 0.4), scene);
  fill.intensity = bright ? 0.38 : 0.32;
  fill.diffuse = new Color3(0.9, 0.93, 1);
  fill.specular = new Color3(0.06, 0.06, 0.07);

  let shadows: ShadowGenerator | null = null;
  try {
    shadows = new ShadowGenerator(1024, key);
    shadows.useBlurExponentialShadowMap = true;
    shadows.blurKernel = 16;
    shadows.darkness = 0.22;
    shadows.bias = 0.0008;
    shadows.normalBias = 0.02;
    // Soft contact-like shadows when supported
    const sg = shadows as ShadowGenerator & { contactHardeningLightSizeUVRatio?: number };
    if (typeof sg.contactHardeningLightSizeUVRatio === "number") {
      sg.contactHardeningLightSizeUVRatio = 0.08;
    }
  } catch {
    shadows = null;
  }

  return { hemi, key, fill, ambient, shadows, rootAngle: 0 };
}

export function updateLightsForBackground(
  lights: ViewerLights,
  background: ViewerBackground,
): void {
  const bright = background === "whiteStudio" || background === "lightGray";
  lights.hemi.intensity = bright ? 0.55 : 0.48;
  lights.ambient.intensity = bright ? 0.28 : 0.22;
  lights.key.intensity = bright ? 0.7 : 0.62;
  lights.fill.intensity = bright ? 0.38 : 0.32;
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
