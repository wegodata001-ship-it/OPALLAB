"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Boxes,
  Eye,
  EyeOff,
  Gauge,
  Maximize2,
  Minimize2,
  RotateCcw,
  Sun,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModelPerfTimings } from "@/lib/orders/model-meta";
import { loadModelFast } from "@/lib/orders/load-model-fast";
import type { CachedGeometry } from "@/lib/orders/geometry-cache";

export type ModelViewerSource = {
  url?: string;
  file?: File | null;
  fileName: string;
  fileId?: string;
  fileSize?: number;
  label?: string;
  role?: "upper" | "lower" | "bite" | "other";
};

interface ModelViewer3DProps {
  url?: string;
  fileName: string;
  file?: File | null;
  fileId?: string;
  fileSize?: number;
  companions?: ModelViewerSource[];
  className?: string;
  onError?: () => void;
  onLoaded?: () => void;
  showToolbar?: boolean;
  showPerf?: boolean;
}

type ViewMode = "solid" | "wireframe";
type CameraMode = "perspective" | "orthographic";

export function ModelViewer3D({
  url,
  fileName,
  file,
  fileId,
  fileSize,
  companions = [],
  className,
  onError,
  onLoaded,
  showToolbar = true,
  showPerf = true,
}: ModelViewer3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("solid");
  const [cameraMode, setCameraMode] = useState<CameraMode>("perspective");
  const [transparent, setTransparent] = useState(false);
  const [darkBg, setDarkBg] = useState(false);
  const [lightingOn, setLightingOn] = useState(true);
  const [hideUpper, setHideUpper] = useState(false);
  const [hideLower, setHideLower] = useState(false);
  const [biteView, setBiteView] = useState(false);
  const [occlusion, setOcclusion] = useState(false);
  const [perf, setPerf] = useState<ModelPerfTimings | null>(null);
  const [showPerfPanel, setShowPerfPanel] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiRef = useRef<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    controls: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    perspective: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    orthographic: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    activeCamera: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    renderer: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scene: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lights: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    groups: { role: string; object: any }[];
    defaultCam: { x: number; y: number; z: number };
    maxDim: number;
  } | null>(null);

  const resetView = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    api.activeCamera.position.set(api.defaultCam.x, api.defaultCam.y, api.defaultCam.z);
    api.controls.target.set(0, 0, 0);
    api.controls.update();
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const api = apiRef.current;
    if (!api) return;
    api.activeCamera.position.multiplyScalar(factor);
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
    const api = apiRef.current;
    if (!api) return;
    api.controls.autoRotate = autoRotate;
    api.scene.background.set(darkBg ? 0x0f172a : 0xf8fafc);
    for (const light of api.lights) light.visible = lightingOn;
    for (const { role, object } of api.groups) {
      if (role === "upper") object.visible = !hideUpper;
      if (role === "lower") object.visible = !hideLower;
      object.traverse(
        (child: {
          isMesh?: boolean;
          material?: {
            wireframe?: boolean;
            transparent?: boolean;
            opacity?: number;
            depthWrite?: boolean;
          };
        }) => {
          if (!child.isMesh || !child.material) return;
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) {
            m.wireframe = viewMode === "wireframe";
            m.transparent = transparent || occlusion;
            m.opacity = transparent ? 0.45 : occlusion && role !== "bite" ? 0.75 : 1;
            m.depthWrite = !transparent;
          }
        },
      );
      if (biteView && (role === "upper" || role === "lower")) {
        object.position.y = role === "upper" ? api.maxDim * 0.02 : -api.maxDim * 0.02;
      } else if (!biteView && (role === "upper" || role === "lower")) {
        object.position.y = 0;
      }
    }
  }, [
    autoRotate,
    darkBg,
    lightingOn,
    hideUpper,
    hideLower,
    viewMode,
    transparent,
    occlusion,
    biteView,
  ]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api || !containerRef.current) return;
    const w = containerRef.current.clientWidth || 800;
    const h = containerRef.current.clientHeight || 480;
    if (cameraMode === "orthographic") {
      api.activeCamera = api.orthographic;
      api.controls.object = api.orthographic;
    } else {
      api.activeCamera = api.perspective;
      api.controls.object = api.perspective;
    }
    if (api.activeCamera.isPerspectiveCamera) {
      api.activeCamera.aspect = w / h;
    } else {
      const aspect = w / h;
      const frustum = api.maxDim * 1.2;
      api.activeCamera.left = (-frustum * aspect) / 2;
      api.activeCamera.right = (frustum * aspect) / 2;
      api.activeCamera.top = frustum / 2;
      api.activeCamera.bottom = -frustum / 2;
    }
    api.activeCamera.updateProjectionMatrix();
    api.controls.update();
  }, [cameraMode]);

  useEffect(() => {
    let disposed = false;
    let animationId = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let renderer: any = null;
    let resizeObserver: ResizeObserver | null = null;

    async function init() {
      if (!containerRef.current) return;
      setStatus("loading");
      setErrorMessage(null);
      setPerf(null);
      apiRef.current = null;

      try {
        const sources: ModelViewerSource[] = [
          { url, file, fileName, fileId, fileSize, role: inferRole(fileName) },
          ...companions,
        ].filter((s) => s.file || s.fileId || s.url);

        if (!sources.length) throw new Error("חסר מקור למודל");

        // Dynamic import — Three.js only when viewer mounts
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");

        const loaded: { role: string; geometry: CachedGeometry; timings: ModelPerfTimings }[] = [];
        for (const src of sources) {
          if (src.file || src.fileId) {
            const result = await loadModelFast({
              fileId: src.fileId || `local:${src.fileName}`,
              fileName: src.fileName,
              fileSize: src.fileSize,
              localFile: src.file,
            });
            loaded.push({
              role: src.role ?? inferRole(src.fileName),
              geometry: result.geometry,
              timings: result.timings,
            });
            continue;
          }

          // Legacy: view URL only (may 302 to Signed URL)
          if (!src.url) throw new Error(`חסר מקור ל־${src.fileName}`);
          const t0 = performance.now();
          const res = await fetch(src.url, { credentials: "include", redirect: "follow" });
          if (!res.ok) throw new Error("טעינת הקובץ נכשלה");
          const buffer = await res.arrayBuffer();
          const { parseModelGeometry } = await import("@/lib/orders/parse-model-worker");
          const parsed = await parseModelGeometry(src.fileName, buffer);
          loaded.push({
            role: src.role ?? inferRole(src.fileName),
            geometry: {
              fileId: `url:${src.fileName}`,
              fileSize: buffer.byteLength,
              positions: parsed.positions,
              normals: parsed.normals,
              colors: parsed.colors,
              indices: parsed.indices,
              meta: parsed.meta,
              cachedAt: Date.now(),
            },
            timings: {
              apiMs: 0,
              storageMs: Math.round(performance.now() - t0),
              parseMs: parsed.meta.parseMs ?? 0,
              renderMs: 0,
              totalMs: Math.round(performance.now() - t0),
              cacheHit: false,
              source: "network",
            },
          });
        }

        if (disposed || !containerRef.current) return;
        const tRender = performance.now();
        const container = containerRef.current;
        const width = container.clientWidth || 800;
        const height = container.clientHeight || 480;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf8fafc);

        const perspective = new THREE.PerspectiveCamera(45, width / height, 0.01, 100000);
        const orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100000);

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.innerHTML = "";
        container.appendChild(renderer.domElement);

        const controls = new OrbitControls(perspective, renderer.domElement);
        controls.enableDamping = true;
        controls.enablePan = true;
        controls.enableZoom = true;
        controls.enableRotate = true;
        controls.autoRotate = false;
        controls.autoRotateSpeed = 1.2;

        const ambient = new THREE.AmbientLight(0xffffff, 0.65);
        const dir = new THREE.DirectionalLight(0xffffff, 0.95);
        dir.position.set(1.2, 1.5, 1);
        const fill = new THREE.DirectionalLight(0xffffff, 0.35);
        fill.position.set(-1, 0.4, -0.8);
        scene.add(ambient, dir, fill);

        const root = new THREE.Group();
        const groups: { role: string; object: InstanceType<typeof THREE.Object3D> }[] = [];
        let maxDim = 1;

        for (const item of loaded) {
          const g = item.geometry;
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute("position", new THREE.BufferAttribute(g.positions, 3));
          if (g.normals) {
            geometry.setAttribute("normal", new THREE.BufferAttribute(g.normals, 3));
          } else {
            geometry.computeVertexNormals();
          }
          if (g.colors) {
            geometry.setAttribute("color", new THREE.BufferAttribute(g.colors, 3));
          }
          if (g.indices) {
            geometry.setIndex(new THREE.BufferAttribute(g.indices, 1));
          }

          // Use upload-time center — do not recompute Box3 for camera
          const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({
              color: g.meta.hasVertexColors ? 0xffffff : 0xc9a227,
              vertexColors: g.meta.hasVertexColors,
              metalness: 0.12,
              roughness: 0.55,
              side: THREE.DoubleSide,
            }),
          );
          mesh.position.set(-g.meta.center[0], -g.meta.center[1], -g.meta.center[2]);
          const group = new THREE.Group();
          group.add(mesh);
          root.add(group);
          groups.push({ role: item.role, object: group });
          maxDim = Math.max(maxDim, g.meta.maxDim || 1);
        }

        scene.add(root);

        const defaultCam = { x: maxDim * 1.5, y: maxDim * 1.2, z: maxDim * 1.8 };
        perspective.position.set(defaultCam.x, defaultCam.y, defaultCam.z);
        orthographic.position.set(defaultCam.x, defaultCam.y, defaultCam.z);
        const aspect = width / height;
        orthographic.left = (-maxDim * 1.2 * aspect) / 2;
        orthographic.right = (maxDim * 1.2 * aspect) / 2;
        orthographic.top = (maxDim * 1.2) / 2;
        orthographic.bottom = (-maxDim * 1.2) / 2;
        orthographic.updateProjectionMatrix();
        controls.target.set(0, 0, 0);
        controls.update();

        apiRef.current = {
          controls,
          perspective,
          orthographic,
          activeCamera: perspective,
          renderer,
          scene,
          lights: [ambient, dir, fill],
          groups,
          defaultCam,
          maxDim,
        };

        const onResize = () => {
          if (!containerRef.current || !renderer || !apiRef.current) return;
          const w = containerRef.current.clientWidth;
          const h = containerRef.current.clientHeight;
          if (w < 2 || h < 2) return;
          const cam = apiRef.current.activeCamera;
          if (cam.isPerspectiveCamera) cam.aspect = w / h;
          else {
            const fr = apiRef.current.maxDim * 1.2;
            cam.left = (-fr * (w / h)) / 2;
            cam.right = (fr * (w / h)) / 2;
            cam.top = fr / 2;
            cam.bottom = -fr / 2;
          }
          cam.updateProjectionMatrix();
          renderer.setSize(w, h);
        };
        resizeObserver = new ResizeObserver(onResize);
        resizeObserver.observe(container);

        const animate = () => {
          if (disposed) return;
          animationId = requestAnimationFrame(animate);
          controls.update();
          const cam = apiRef.current?.activeCamera ?? perspective;
          renderer?.render(scene, cam);
        };
        animate();

        const renderMs = Math.round(performance.now() - tRender);
        const primary = loaded[0]?.timings;
        if (primary) {
          setPerf({
            ...primary,
            renderMs,
            totalMs: primary.totalMs + renderMs,
          });
        }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    url,
    fileName,
    file,
    fileId,
    fileSize,
    onError,
    onLoaded,
    companions.map((c) => `${c.fileId}:${c.fileName}:${c.url ?? ""}`).join("|"),
  ]);

  const hasJawPair =
    companions.some((c) => c.role === "upper" || c.role === "lower") ||
    /upper|lower|עליון|תחתון/i.test(fileName);

  const perfOk = perf
    ? {
        api: perf.apiMs < 150,
        parse: perf.parseMs < 200 || perf.cacheHit,
        total: perf.totalMs < (perf.cacheHit ? 150 : 500),
      }
    : null;

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

      {showPerf && perf && showPerfPanel && (
        <div className="absolute top-3 left-3 z-20 rounded-lg bg-slate-900/90 text-white text-[11px] p-3 space-y-1 min-w-[180px] font-mono">
          <p className="font-bold text-xs mb-1">דוח ביצועים</p>
          <Row ok={perfOk?.api} label="API" value={`${perf.apiMs}ms`} target="<150" />
          <Row ok label="Storage" value={`${perf.storageMs}ms`} />
          <Row
            ok={perfOk?.parse}
            label="Parse"
            value={perf.cacheHit ? `cache (${perf.source})` : `${perf.parseMs}ms`}
            target="<200"
          />
          <Row ok label="Render" value={`${perf.renderMs}ms`} />
          <Row
            ok={perfOk?.total}
            label="Total"
            value={`${perf.totalMs}ms`}
            target={perf.cacheHit ? "<150" : "<500"}
          />
        </div>
      )}

      {showToolbar && status === "ready" && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-wrap justify-center gap-1 max-w-[95%] rounded-xl bg-white/95 border shadow-md p-1">
          <ToolBtn title="הקטן" onClick={() => zoomBy(1.15)}>
            <ZoomOut className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="הגדל" onClick={() => zoomBy(0.85)}>
            <ZoomIn className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="איפוס מצלמה" onClick={resetView}>
            <RotateCcw className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="מסך מלא" onClick={() => void toggleFullscreen()}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </ToolBtn>
          <ToolBtn title="סיבוב אוטומטי" active={autoRotate} onClick={() => setAutoRotate((v) => !v)}>
            <Boxes className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn
            title={cameraMode === "perspective" ? "אורתוגרפי" : "פרספקטיבה"}
            onClick={() =>
              setCameraMode((m) => (m === "perspective" ? "orthographic" : "perspective"))
            }
          >
            <span className="text-[10px] font-bold px-0.5">
              {cameraMode === "perspective" ? "3D" : "2D"}
            </span>
          </ToolBtn>
          <ToolBtn
            title={viewMode === "solid" ? "Wireframe" : "Solid"}
            active={viewMode === "wireframe"}
            onClick={() => setViewMode((m) => (m === "solid" ? "wireframe" : "solid"))}
          >
            <span className="text-[10px] font-bold">WF</span>
          </ToolBtn>
          <ToolBtn title="שקיפות" active={transparent} onClick={() => setTransparent((v) => !v)}>
            <span className="text-[10px] font-bold">α</span>
          </ToolBtn>
          <ToolBtn title="תאורה" active={lightingOn} onClick={() => setLightingOn((v) => !v)}>
            <Sun className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="רקע" active={darkBg} onClick={() => setDarkBg((v) => !v)}>
            <span className="text-[10px] font-bold">{darkBg ? "◐" : "◯"}</span>
          </ToolBtn>
          {showPerf && (
            <ToolBtn
              title="דוח ביצועים"
              active={showPerfPanel}
              onClick={() => setShowPerfPanel((v) => !v)}
            >
              <Gauge className="h-4 w-4" />
            </ToolBtn>
          )}

          {hasJawPair && (
            <>
              <ToolBtn title="הסתר עליון" active={hideUpper} onClick={() => setHideUpper((v) => !v)}>
                {hideUpper ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="text-[9px]">U</span>
              </ToolBtn>
              <ToolBtn title="הסתר תחתון" active={hideLower} onClick={() => setHideLower((v) => !v)}>
                {hideLower ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="text-[9px]">L</span>
              </ToolBtn>
              <ToolBtn title="Bite View" active={biteView} onClick={() => setBiteView((v) => !v)}>
                <span className="text-[10px] font-bold">Bite</span>
              </ToolBtn>
              <ToolBtn title="Occlusion" active={occlusion} onClick={() => setOcclusion((v) => !v)}>
                <span className="text-[10px] font-bold">Occ</span>
              </ToolBtn>
              <ToolBtn
                title="Align"
                onClick={() => {
                  resetView();
                  setBiteView(false);
                  setHideUpper(false);
                  setHideLower(false);
                }}
              >
                <span className="text-[10px] font-bold">Align</span>
              </ToolBtn>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  target,
  ok,
}: {
  label: string;
  value: string;
  target?: string;
  ok?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-300">{label}</span>
      <span className={cn(ok === false ? "text-amber-300" : ok ? "text-emerald-300" : "text-white")}>
        {value}
        {target ? <span className="text-slate-500"> / {target}</span> : null}
      </span>
    </div>
  );
}

function ToolBtn({
  title,
  onClick,
  children,
  active,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      title={title}
      onClick={onClick}
      className={cn(active && "bg-opal-gold/20 text-opal-gold-dark")}
    >
      {children}
    </Button>
  );
}

function inferRole(name: string): "upper" | "lower" | "bite" | "other" {
  const lower = name.toLowerCase().replace(/[\s_-]+/g, "");
  if (lower.includes("upper") || lower.includes("maxilla") || lower.includes("עליון")) return "upper";
  if (lower.includes("lower") || lower.includes("mandible") || lower.includes("תחתון")) return "lower";
  if (lower.includes("bite") || lower.includes("סגר")) return "bite";
  return "other";
}
