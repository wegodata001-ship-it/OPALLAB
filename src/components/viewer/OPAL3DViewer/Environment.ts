import {
  Color3,
  Color4,
  CubeTexture,
  DefaultRenderingPipeline,
  ImageProcessingConfiguration,
  MeshBuilder,
  StandardMaterial,
  Texture,
  type Scene,
} from "@babylonjs/core";
import type { ViewerTheme } from "./types";

export type EnvironmentHandle = {
  pipeline: DefaultRenderingPipeline | null;
  skybox: ReturnType<typeof MeshBuilder.CreateBox> | null;
};

/**
 * HDR-style IBL + skybox + tone mapping + AO/FXAA/MSAA via default pipeline.
 * Uses a procedural environment when no external HDR asset is bundled.
 */
export function setupEnvironment(scene: Scene, theme: ViewerTheme): EnvironmentHandle {
  // Procedural studio-like IBL (Babylon built-in environment)
  try {
    const env = CubeTexture.CreateFromPrefilteredData(
      // Babylon CDN studio env — dental-friendly soft reflections
      "https://assets.babylonjs.com/environments/studio.env",
      scene,
    );
    scene.environmentTexture = env;
    scene.environmentIntensity = theme === "dark" ? 0.75 : 0.95;
  } catch {
    scene.createDefaultEnvironment({
      createGround: false,
      createSkybox: false,
      cameraContrast: 1.1,
      cameraExposure: 1,
    });
  }

  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType =
    ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure = theme === "dark" ? 1.05 : 1.15;
  scene.imageProcessingConfiguration.contrast = 1.08;

  let skybox: ReturnType<typeof MeshBuilder.CreateBox> | null = null;
  try {
    skybox = MeshBuilder.CreateBox("opalSky", { size: 5000 }, scene);
    const skyMat = new StandardMaterial("opalSkyMat", scene);
    skyMat.backFaceCulling = false;
    skyMat.disableLighting = true;
    skyMat.emissiveColor =
      theme === "dark" ? new Color3(0.07, 0.08, 0.1) : new Color3(0.88, 0.9, 0.93);
    if (scene.environmentTexture) {
      skyMat.reflectionTexture = scene.environmentTexture.clone() as Texture;
      if (skyMat.reflectionTexture) {
        skyMat.reflectionTexture.coordinatesMode = Texture.SKYBOX_MODE;
      }
    }
    skybox.material = skyMat;
    skybox.infiniteDistance = true;
    skybox.isPickable = false;
    skybox.ignoreCameraMaxZ = true;
  } catch {
    skybox = null;
  }

  let pipeline: DefaultRenderingPipeline | null = null;
  try {
    pipeline = new DefaultRenderingPipeline("opalPipeline", true, scene, scene.cameras);
    pipeline.fxaaEnabled = true;
    pipeline.samples = 4; // MSAA
    pipeline.imageProcessingEnabled = true;
    if (pipeline.imageProcessing) {
      pipeline.imageProcessing.toneMappingEnabled = true;
      pipeline.imageProcessing.contrast = 1.08;
      pipeline.imageProcessing.exposure = theme === "dark" ? 1.05 : 1.15;
    }
    // SSAO2 when available on pipeline
    const anyPipe = pipeline as DefaultRenderingPipeline & {
      sharpenEnabled?: boolean;
    };
    if ("sharpenEnabled" in anyPipe) anyPipe.sharpenEnabled = false;
  } catch {
    pipeline = null;
  }

  return { pipeline, skybox };
}

export function updateEnvironmentTheme(handle: EnvironmentHandle, scene: Scene, theme: ViewerTheme): void {
  scene.clearColor =
    theme === "dark" ? new Color4(0.08, 0.09, 0.11, 1) : new Color4(0.93, 0.94, 0.96, 1);
  scene.environmentIntensity = theme === "dark" ? 0.75 : 0.95;
  scene.imageProcessingConfiguration.exposure = theme === "dark" ? 1.05 : 1.15;
  if (handle.skybox?.material instanceof StandardMaterial) {
    handle.skybox.material.emissiveColor =
      theme === "dark" ? new Color3(0.07, 0.08, 0.1) : new Color3(0.88, 0.9, 0.93);
  }
  if (handle.pipeline?.imageProcessing) {
    handle.pipeline.imageProcessing.exposure = theme === "dark" ? 1.05 : 1.15;
  }
}
