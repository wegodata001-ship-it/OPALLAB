import type { ParsedModelGeometry } from "@/lib/orders/parse-model-worker";

/** Fast PNG thumb from already-parsed positions (no second STL parse). */
export async function thumbnailFromGeometry(
  parsed: ParsedModelGeometry,
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  try {
    const THREE = await import("three");
    const size = 256;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100000);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: false,
    });
    renderer.setSize(size, size);
    renderer.setPixelRatio(1);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(2, 3, 4);
    scene.add(dir);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(parsed.positions, 3),
    );
    if (parsed.normals) {
      geometry.setAttribute("normal", new THREE.BufferAttribute(parsed.normals, 3));
    } else {
      geometry.computeVertexNormals();
    }
    if (parsed.colors) {
      geometry.setAttribute("color", new THREE.BufferAttribute(parsed.colors, 3));
    }
    if (parsed.indices) {
      geometry.setIndex(new THREE.BufferAttribute(parsed.indices, 1));
    }

    const material = new THREE.MeshStandardMaterial({
      color: parsed.meta.hasVertexColors ? 0xffffff : 0xc9a227,
      vertexColors: parsed.meta.hasVertexColors,
      metalness: 0.1,
      roughness: 0.6,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(-parsed.meta.center[0], -parsed.meta.center[1], -parsed.meta.center[2]);
    scene.add(mesh);

    const d = parsed.meta.maxDim || 1;
    camera.position.set(d * 1.4, d * 1.1, d * 1.6);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);

    const blob = await new Promise<Blob | null>((resolve) => {
      renderer.domElement.toBlob((b: Blob | null) => resolve(b), "image/png");
    });

    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    return blob;
  } catch {
    return null;
  }
}
