import {
  THUMBNAIL_MAX_BYTES,
  canOpenInModelViewer,
} from "@/lib/orders/scan-file";
import {
  bundleFromFile,
  createThreeObjectFromBundle,
} from "@/lib/orders/load-model3d";

/**
 * Render a lightweight offscreen Three.js snapshot of a 3D scan for tile thumbnails.
 * Returns a data URL (PNG) or null if unsupported / too large / failed.
 * Preserves PLY vertex colors when present.
 */
export async function generateModelThumbnail(file: File): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (!canOpenInModelViewer(file)) return null;
  if (file.size > THUMBNAIL_MAX_BYTES) return null;

  try {
    const bundle = await bundleFromFile(file);
    if (!bundle) return null;

    const THREE = await import("three");
    const size = 256;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);

    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 10000);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(size, size);
    renderer.setPixelRatio(1);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(2, 3, 4);
    scene.add(dir);

    const object = await createThreeObjectFromBundle(THREE, bundle);

    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const dims = box.getSize(new THREE.Vector3());
    object.position.sub(center);
    scene.add(object);

    const maxDim = Math.max(dims.x, dims.y, dims.z) || 1;
    camera.position.set(maxDim * 1.4, maxDim * 1.1, maxDim * 1.6);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);

    const dataUrl = renderer.domElement.toDataURL("image/png");

    geometryDispose(object);
    renderer.dispose();
    renderer.forceContextLoss?.();

    return dataUrl;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function geometryDispose(object: any) {
  object?.traverse?.(
    (child: {
      geometry?: { dispose?: () => void };
      material?: { dispose?: () => void } | Array<{ dispose?: () => void }>;
    }) => {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose?.());
      else child.material?.dispose?.();
    },
  );
}
