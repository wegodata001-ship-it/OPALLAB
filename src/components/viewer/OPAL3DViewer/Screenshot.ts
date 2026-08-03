import { Color4, type Engine, type Scene } from "@babylonjs/core";

/**
 * Capture PNG at ~4K with optional transparent background.
 */
export async function captureScreenshot4K(
  engine: Engine,
  scene: Scene,
  opts?: { transparent?: boolean; width?: number; height?: number },
): Promise<string> {
  const width = opts?.width ?? 3840;
  const height = opts?.height ?? 2160;
  const transparent = opts?.transparent ?? true;
  const prev = scene.clearColor.clone();

  if (transparent) {
    scene.clearColor = new Color4(0, 0, 0, 0);
  }

  return new Promise((resolve, reject) => {
    try {
      // Hide skybox for clean capture
      const sky = scene.getMeshByName("opalSky");
      const skyWas = sky?.isVisible;
      if (sky) sky.isVisible = false;

      scene.render();
      ToolsScreenshot(engine, scene, width, height)
        .then((data) => {
          if (sky && skyWas != null) sky.isVisible = skyWas;
          scene.clearColor = prev;
          resolve(data);
        })
        .catch((err) => {
          if (sky && skyWas != null) sky.isVisible = skyWas;
          scene.clearColor = prev;
          reject(err);
        });
    } catch (err) {
      scene.clearColor = prev;
      reject(err);
    }
  });
}

function ToolsScreenshot(
  engine: Engine,
  scene: Scene,
  width: number,
  height: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // Use Babylon Tools via dynamic import shape on engine
      const canvas = engine.getRenderingCanvas();
      if (!canvas) {
        reject(new Error("No canvas"));
        return;
      }
      // Render at target size using CreateScreenshotUsingRenderTarget when available
      import("@babylonjs/core/Misc/tools")
        .then(({ Tools }) => {
          Tools.CreateScreenshotUsingRenderTarget(
            engine,
            scene.activeCamera!,
            { width, height },
            (data) => resolve(data),
            "image/png",
            1,
            false,
            "opal-screenshot",
            undefined,
            undefined,
            true,
          );
        })
        .catch(() => {
          // Fallback: current buffer
          try {
            resolve(canvas.toDataURL("image/png"));
          } catch (e) {
            reject(e);
          }
        });
    } catch (e) {
      reject(e);
    }
  });
}

export function downloadDataUrl(dataUrl: string, fileName: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = fileName;
  a.click();
}
