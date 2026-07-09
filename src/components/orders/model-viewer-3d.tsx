"use client";

import { useEffect, useRef, useState } from "react";

interface ModelViewer3DProps {
  url: string;
  fileName: string;
  onError?: () => void;
  onLoaded?: () => void;
}

export function ModelViewer3D({ url, fileName, onError, onLoaded }: ModelViewer3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let disposed = false;
    let animationId = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let renderer: any = null;

    async function init() {
      if (!containerRef.current) return;
      setStatus("loading");

      try {
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

        const container = containerRef.current;
        const width = container.clientWidth || 800;
        const height = container.clientHeight || 600;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf1f5f9);

        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10000);
        camera.position.set(0, 0, 200);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.innerHTML = "";
        container.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        scene.add(new THREE.AmbientLight(0xffffff, 0.65));
        const dir = new THREE.DirectionalLight(0xffffff, 0.85);
        dir.position.set(1, 1, 1);
        scene.add(dir);

        const response = await fetch(url, { credentials: "include" });
        if (!response.ok) throw new Error("load failed");
        const buffer = await response.arrayBuffer();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let object: any;
        if (ext === "stl") {
          const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
          const geometry = new STLLoader().parse(buffer);
          geometry.computeVertexNormals();
          object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.2, roughness: 0.55 }));
        } else if (ext === "obj") {
          const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
          object = new OBJLoader().parse(new TextDecoder().decode(buffer));
        } else if (ext === "ply") {
          const { PLYLoader } = await import("three/examples/jsm/loaders/PLYLoader.js");
          const geometry = new PLYLoader().parse(buffer);
          geometry.computeVertexNormals();
          object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.2, roughness: 0.55 }));
        } else {
          throw new Error("unsupported");
        }

        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        object.position.sub(center);
        scene.add(object);

        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        camera.position.set(maxDim * 1.5, maxDim * 1.2, maxDim * 1.8);
        controls.target.set(0, 0, 0);
        controls.update();

        const animate = () => {
          if (disposed) return;
          animationId = requestAnimationFrame(animate);
          controls.update();
          renderer?.render(scene, camera);
        };
        animate();

        if (!disposed) {
          setStatus("ready");
          onLoaded?.();
        }
      } catch {
        if (!disposed) {
          setStatus("error");
          onError?.();
        }
      }
    }

    void init();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationId);
      renderer?.dispose();
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [url, fileName, onError, onLoaded]);

  return (
    <div ref={containerRef} className="w-full h-full min-h-[60vh] relative bg-slate-100 rounded-lg overflow-hidden">
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-opal-gold border-t-transparent" />
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500 p-6 text-center">
          לא ניתן לטעון את המודל התלת־ממדי
        </div>
      )}
    </div>
  );
}
