import {
  Color3,
  DirectionalLight,
  HemisphericLight,
  ImageProcessingConfiguration,
  Vector3,
  type Scene,
} from "@babylonjs/core";
import type { ViewerTheme } from "./types";

export type ViewerLights = {
  hemi: HemisphericLight;
  key: DirectionalLight;
  fill: DirectionalLight;
};

/**
 * Dental-style lighting: HDR/IBL environment + hemi + dual directional.
 * No lone PointLight.
 */
export function setupLights(scene: Scene, theme: ViewerTheme = "dark"): ViewerLights {
  const hemi = new HemisphericLight(
    "opalHemi",
    new Vector3(0, 1, 0),
    scene,
  );
  hemi.intensity = theme === "dark" ? 0.55 : 0.75;
  hemi.groundColor = theme === "dark"
    ? new Color3(0.15, 0.16, 0.18)
    : new Color3(0.55, 0.55, 0.58);
  hemi.diffuse = new Color3(1, 1, 1);

  const key = new DirectionalLight(
    "opalKey",
    new Vector3(-0.6, -1, -0.4),
    scene,
  );
  key.intensity = theme === "dark" ? 1.1 : 0.95;
  key.diffuse = new Color3(1, 0.98, 0.95);

  const fill = new DirectionalLight(
    "opalFill",
    new Vector3(0.7, -0.3, 0.5),
    scene,
  );
  fill.intensity = theme === "dark" ? 0.35 : 0.45;
  fill.diffuse = new Color3(0.85, 0.9, 1);

  // Tone mapping + image processing (IBL-friendly)
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType =
    ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure = theme === "dark" ? 1.05 : 1.0;
  scene.imageProcessingConfiguration.contrast = 1.05;

  // Procedural environment for IBL reflections (no external HDR file required)
  try {
    scene.createDefaultEnvironment({
      createGround: false,
      createSkybox: false,
      enableGroundShadow: false,
      cameraContrast: 1.05,
      cameraExposure: theme === "dark" ? 1.05 : 1.0,
    });
  } catch {
    // Environment helper may fail in constrained WebGL — lights alone still work
  }

  scene.environmentIntensity = theme === "dark" ? 0.55 : 0.7;

  return { hemi, key, fill };
}

export function updateLightsForTheme(lights: ViewerLights, theme: ViewerTheme): void {
  lights.hemi.intensity = theme === "dark" ? 0.55 : 0.75;
  lights.key.intensity = theme === "dark" ? 1.1 : 0.95;
  lights.fill.intensity = theme === "dark" ? 0.35 : 0.45;
}
