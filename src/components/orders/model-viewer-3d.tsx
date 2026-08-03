"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveModelSource } from "@/lib/orders/scan-file";

interface ModelViewer3DProps {
  /** Remote URL (order file view) — used when `file` is not provided. */
  url?: string;
  fileName: string;
  /** Local File (create-order draft) — preferred when present. */
  file?: File | null;
  className?: string;
  onError?: () => void;
  onLoaded?: () => void;
  showToolbar?: boolean;
}

export function ModelViewer3D({
  url,
  fileName,
  file,
  className,
  onError,
  onLoaded,
  showToolbar = true,
}: ModelViewer3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiRef = useRef<{
    controls: any;
    camera: any;
    renderer: any;
    defaultCam: { x: number; y: number; z: number };
    maxDim: number;
  } | null>(null);

  const resetView = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    api.camera.position.set(api.defaultCam.x, api.defaultCam.y, api.defaultCam.z);
    api.controls.target.set(0, 0, 0);
    api.controls.update();
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const api = apiRef.current;
    if (!api) return;
    api.camera.position.multiplyScalar(factor);
    api.controls.update();
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = wrapRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    let disposed = false;
    let animationId = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let renderer: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resizeObserver: ResizeObserver | null = null;

    async function init() {
      if (!containerRef.current) return;
      setStatus("loading");
      setErrorMessage(null);
      apiRef.current = null;

      try {
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");

        let buffer: ArrayBuffer;
        let modelName = fileName;
        let ext = (fileName.split(".").pop() ?? "").toLowerCase();

        if (file) {
          const resolved = await resolveModelSource(file);
          if (!resolved) {
            throw new Error(
              file.name.toLowerCase().endsWith(".zip")
                ? "ה־ZIP אינו מכיל קובץ STL / PLY / OBJ"
                : "פורמט לא נתמך לתצוגה תלת־ממדית",
            );
          }
          buffer = resolved.buffer;
          modelName = resolved.fileName;
          ext = resolved.ext;
        } else if (url) {
          const response = await fetch(url, { credentials: "include" });
          if (!response.ok) throw new Error("טעינת הקובץ מהשרת נכשלה");
          buffer = await response.arrayBuffer();
          if (ext === "zip") {
            const blob = new File([buffer], fileName, { type: "application/zip" });
            const resolved = await resolveModelSource(blob);
            if (!resolved) throw new Error("ה־ZIP אינו מכיל קובץ STL / PLY / OBJ");
            buffer = resolved.buffer;
            modelName = resolved.fileName;
            ext = resolved.ext;
          }
        } else {
          throw new Error("חסר מקור למודל");
        }

        if (disposed || !containerRef.current) return;
        const container = containerRef.current;
        const width = container.clientWidth || 800;
        const height = container.clientHeight || 480;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf1f5f9);

        const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100000);
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.innerHTML = "";
        container.appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.enablePan = true;
        controls.enableZoom = true;
        controls.enableRotate = true;

        scene.add(new THREE.AmbientLight(0xffffff, 0.65));
        const dir = new THREE.DirectionalLight(0xffffff, 0.9);
        dir.position.set(1.2, 1.5, 1);
        scene.add(dir);
        const fill = new THREE.DirectionalLight(0xffffff, 0.35);
        fill.position.set(-1, 0.4, -0.8);
        scene.add(fill);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let object: any;
        if (ext === "stl") {
          const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
          const geometry = new STLLoader().parse(buffer);
          geometry.computeVertexNormals();
          object = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.2, roughness: 0.55 }),
          );
        } else if (ext === "obj") {
          const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
          object = new OBJLoader().parse(new TextDecoder().decode(buffer));
          object.traverse((child: { isMesh?: boolean; material?: unknown }) => {
            if (child.isMesh) {
              child.material = new THREE.MeshStandardMaterial({
                color: 0xc9a227,
                metalness: 0.2,
                roughness: 0.55,
              });
            }
          });
        } else if (ext === "ply") {
          const { PLYLoader } = await import("three/examples/jsm/loaders/PLYLoader.js");
          const geometry = new PLYLoader().parse(buffer);
          geometry.computeVertexNormals();
          object = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.2, roughness: 0.55 }),
          );
        } else {
          throw new Error(`פורמט .${ext} אינו נתמך ב־Viewer`);
        }

        void modelName;

        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        object.position.sub(center);
        scene.add(object);

        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const defaultCam = { x: maxDim * 1.5, y: maxDim * 1.2, z: maxDim * 1.8 };
        camera.position.set(defaultCam.x, defaultCam.y, defaultCam.z);
        controls.target.set(0, 0, 0);
        controls.update();

        apiRef.current = { controls, camera, renderer, defaultCam, maxDim };

        const onResize = () => {
          if (!containerRef.current || !renderer) return;
          const w = containerRef.current.clientWidth;
          const h = containerRef.current.clientHeight;
          if (w < 2 || h < 2) return;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        };
        resizeObserver = new ResizeObserver(onResize);
        resizeObserver.observe(container);

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
      } catch (err) {
        if (!disposed) {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "שגיאה בטעינת המודל");
          onError?.();
        }
      }
    }

    void init();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationId);
      resizeObserver?.disconnect();
      renderer?.dispose();
      apiRef.current = null;
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [url, fileName, file, onError, onLoaded]);

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative w-full h-full min-h-[320px] bg-slate-100 rounded-lg overflow-hidden",
        isFullscreen && "min-h-screen rounded-none",
        className,
      )}
    >
      <div ref={containerRef} className="absolute inset-0" />

      {status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-100/85 z-10">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-opal-gold border-t-transparent" />
          <p className="text-xs text-slate-500">טוען מודל תלת־ממדי...</p>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-600 p-6 text-center z-10 bg-slate-100">
          {errorMessage || "לא ניתן לטעון את המודל התלת־ממדי"}
        </div>
      )}

      {showToolbar && status === "ready" && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex gap-1 rounded-xl bg-white/95 border shadow-md p-1">
          <Button type="button" size="sm" variant="ghost" title="הקטן" onClick={() => zoomBy(1.15)}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant="ghost" title="הגדל" onClick={() => zoomBy(0.85)}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant="ghost" title="איפוס תצוגה" onClick={resetView}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button type="button" size="sm" variant="ghost" title="מסך מלא" onClick={() => void toggleFullscreen()}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </div>
  );
}
