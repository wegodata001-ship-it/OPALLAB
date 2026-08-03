"use client";

import { useEffect, useState } from "react";
import type { Engine, Scene } from "@babylonjs/core";

type ThumbnailProps = {
  engine: Engine | null;
  scene: Scene | null;
  /** Trigger re-capture */
  version?: number;
  className?: string;
  size?: number;
};

/**
 * Captures a small screenshot from the live Babylon canvas for UI thumbnails.
 */
export function Thumbnail({
  engine,
  scene,
  version = 0,
  className,
  size = 96,
}: ThumbnailProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!engine || !scene) return;
    try {
      scene.render();
      const data = engine.getRenderingCanvas()?.toDataURL("image/png");
      if (data) setSrc(data);
    } catch {
      setSrc(null);
    }
  }, [engine, scene, version]);

  if (!src) {
    return (
      <div
        className={className}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ objectFit: "cover" }}
    />
  );
}

export async function captureScreenshot(
  engine: Engine,
  scene: Scene,
): Promise<string | null> {
  try {
    scene.render();
    return engine.getRenderingCanvas()?.toDataURL("image/png") ?? null;
  } catch {
    return null;
  }
}
