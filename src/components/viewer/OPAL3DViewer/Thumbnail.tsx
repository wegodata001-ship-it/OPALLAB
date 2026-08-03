"use client";

import { useEffect, useState } from "react";
import {
  ArcRotateCamera,
  Color4,
  Engine,
  HemisphericLight,
  Scene,
  Vector3,
} from "@babylonjs/core";
import { loadDentalScene } from "./Loaders";
import { centerAndScaleScene, fitCameraToMeshes } from "./Camera";
import { createMaterialForMesh } from "./Materials";
import type { SceneAsset } from "./types";
import { detectFormat, inferSceneLayer } from "./Utils";

/** Capture a real mesh thumbnail (not a placeholder). */
export async function captureSceneThumbnail(
  assets: SceneAsset[],
  size = 512,
): Promise<string | null> {
  if (typeof document === "undefined" || !assets.length) return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true }, true);
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 0);
  new HemisphericLight("tL", new Vector3(0, 1, 0), scene);
  const camera = new ArcRotateCamera("tC", -Math.PI / 2.2, Math.PI / 2.6, 80, Vector3.Zero(), scene);
  camera.attachControl(canvas, false);

  try {
    const loaded = await loadDentalScene(scene, assets.slice(0, 4));
    for (const item of loaded) {
      if (!item.mesh.material) {
        item.mesh.material = createMaterialForMesh(
          scene,
          item.fileName,
          detectFormat(item.fileName),
          inferSceneLayer(item.fileName),
          item.mesh,
        );
      }
    }
    const meshes = loaded.map((l) => l.mesh);
    centerAndScaleScene(meshes);
    fitCameraToMeshes(camera, meshes, 1.25);
    scene.render();
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  } finally {
    scene.dispose();
    engine.dispose();
  }
}

export function Thumbnail({
  assets,
  className,
  alt = "Model preview",
}: {
  assets: SceneAsset[];
  className?: string;
  alt?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void captureSceneThumbnail(assets).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [assets]);

  if (!src) {
    return <div className={className} aria-label={alt} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />;
}

export { captureScreenshot4K as captureScreenshot } from "./Screenshot";
