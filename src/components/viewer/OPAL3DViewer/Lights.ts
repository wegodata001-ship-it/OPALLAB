import {
  Color3,
  DirectionalLight,
  HemisphericLight,
  ShadowGenerator,
  Vector3,
  type Scene,
} from "@babylonjs/core";
import type { ViewerTheme } from "./types";

export type ViewerLights = {
  hemi: HemisphericLight;
  key: DirectionalLight;
  fill: DirectionalLight;
  rim: DirectionalLight;
  shadows: ShadowGenerator | null;
};

export function setupLights(scene: Scene, theme: ViewerTheme): ViewerLights {
  const hemi = new HemisphericLight("opalHemi", new Vector3(0, 1, 0), scene);
  hemi.intensity = theme === "dark" ? 0.55 : 0.75;
  hemi.groundColor = new Color3(0.35, 0.34, 0.32);
  hemi.diffuse = new Color3(1, 0.98, 0.95);

  const key = new DirectionalLight("opalKey", new Vector3(-0.45, -0.85, -0.35), scene);
  key.position = new Vector3(40, 80, 40);
  key.intensity = theme === "dark" ? 1.15 : 1.35;
  key.diffuse = new Color3(1, 0.97, 0.92);

  const fill = new DirectionalLight("opalFill", new Vector3(0.6, -0.35, 0.4), scene);
  fill.intensity = theme === "dark" ? 0.35 : 0.45;
  fill.diffuse = new Color3(0.85, 0.9, 1);

  const rim = new DirectionalLight("opalRim", new Vector3(0.15, -0.2, 0.9), scene);
  rim.intensity = 0.28;
  rim.diffuse = new Color3(0.95, 0.95, 1);

  let shadows: ShadowGenerator | null = null;
  try {
    shadows = new ShadowGenerator(1024, key);
    shadows.useBlurExponentialShadowMap = true;
    shadows.blurKernel = 16;
    shadows.darkness = 0.35;
  } catch {
    shadows = null;
  }

  return { hemi, key, fill, rim, shadows };
}

export function updateLightsForTheme(lights: ViewerLights, theme: ViewerTheme): void {
  lights.hemi.intensity = theme === "dark" ? 0.55 : 0.75;
  lights.key.intensity = theme === "dark" ? 1.15 : 1.35;
  lights.fill.intensity = theme === "dark" ? 0.35 : 0.45;
}
