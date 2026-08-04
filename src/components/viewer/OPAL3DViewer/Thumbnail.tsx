"use client";

import { useEffect, useState } from "react";
import {
  ArcRotateCamera,
  Color4,
  Engine,
  HemisphericLight,
  Scene,
  TransformNode,
  Vector3,
} from "@babylonjs/core";
import { alignDentalScene } from "./Alignment";
import { computeSceneBounds } from "./Camera";
import { loadDentalScene } from "./Loaders";
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
  scene.environmentIntensity = 0.35;
  new HemisphericLight("tL", new Vector3(0.2, 1, 0.1), scene).intensity = 0.7;
  const camera = new ArcRotateCamera("tC", -Math.PI / 2.35, Math.PI / 2.65, 80, Vector3.Zero(), scene);

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
    const root =
      (scene.getTransformNodeByName("opalDentalRoot") as TransformNode | null) ?? null;
    alignDentalScene(root, loaded);
    const meshes = loaded.map((l) => l.mesh);
    const bounds = computeSceneBounds(meshes);
    if (bounds) {
      camera.setTarget(bounds.center.clone());
      camera.radius = Math.max(bounds.radius * 2.6, 2);
    }
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
