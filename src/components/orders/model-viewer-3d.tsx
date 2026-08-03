"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Box,
  Camera,
  Eye,
  EyeOff,
  Focus,
  Gauge,
  Image as ImageIcon,
  Info,
  Layers,
  Maximize2,
  Minimize2,
  RotateCcw,
  Sun,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModelPerfTimings } from "@/lib/orders/model-meta";
import { loadDentalModel } from "@/lib/orders/load-model-fast";
import { isMaterialCompanionName } from "@/lib/orders/load-model3d";
import {
  createDentalViewerEngine,
  type CameraPreset,
  type DentalViewerEngine,
  type ViewerBackground,
  type ViewerLighting,
  type ViewerMeshNode,
  type ViewerQuality,
  type ViewerShade,
} from "@/lib/orders/dental-viewer-engine";

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

function formatBytes(n?: number) {
  if (!n || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function inferRole(name: string): "upper" | "lower" | "bite" | "other" {
  const lower = name.toLowerCase().replace(/[\s_-]+/g, "");
  if (lower.includes("upper") || lower.includes("maxilla") || lower.includes("עליון")) return "upper";
  if (lower.includes("lower") || lower.includes("mandible") || lower.includes("תחתון")) return "lower";
  if (lower.includes("bite") || lower.includes("סגר")) return "bite";
  return "other";
}

function partLabel(name: string, role: string) {
  const lower = name.toLowerCase();
  if (lower.includes("gingiva") || lower.includes("חניכ")) return "Gingiva";
  if (lower.includes("implant")) return "Implants";
  if (lower.includes("crown")) return "Crowns";
  if (lower.includes("bridge")) return "Bridge";
  if (lower.includes("scan")) return "Scan";
  if (role === "upper") return "Upper Jaw";
  if (role === "lower") return "Lower Jaw";
  if (role === "bite") return "Bite";
  return name || "Model";
}

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
  const engineRef = useRef<DentalViewerEngine | null>(null);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("טוען מודל...");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [shade, setShade] = useState<ViewerShade>("original");
  const [background, setBackground] = useState<ViewerBackground>("dark");
  const [lighting, setLighting] = useState<ViewerLighting>("dental");
  const [quality, setQuality] = useState<ViewerQuality>("auto");
  const [ortho, setOrtho] = useState(false);
  const [showTree, setShowTree] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showPerfPanel, setShowPerfPanel] = useState(false);
  const [meshes, setMeshes] = useState<ViewerMeshNode[]>([]);
  const [fps, setFps] = useState(0);
  const [perf, setPerf] = useState<ModelPerfTimings | null>(null);
  const [loadMs, setLoadMs] = useState<number | null>(null);
  const [textureCount, setTextureCount] = useState(0);

  const totalBytes = useMemo(() => {
    const own = fileSize ?? file?.size ?? 0;
    const extra = companions.reduce((s, c) => s + (c.fileSize ?? c.file?.size ?? 0), 0);
    return own + extra;
  }, [fileSize, file, companions]);

  const resetView = useCallback(() => engineRef.current?.setCameraPreset("reset"), []);
  const zoomBy = useCallback((factor: number) => engineRef.current?.zoomBy(factor), []);

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

  const capture = useCallback(
    (format: "png" | "jpeg", transparent?: boolean) => {
      const engine = engineRef.current;
      if (!engine) return;
      const dataUrl = engine.captureScreenshot({ format, transparent });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${fileName.replace(/\.[^.]+$/, "")}-capture.${format === "jpeg" ? "jpg" : "png"}`;
      a.click();
    },
    [fileName],
  );

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    engineRef.current?.setAutoRotate(autoRotate);
  }, [autoRotate]);
  useEffect(() => {
    engineRef.current?.setShade(shade);
  }, [shade]);
  useEffect(() => {
    engineRef.current?.setBackground(background);
  }, [background]);
  useEffect(() => {
    engineRef.current?.setLighting(lighting);
  }, [lighting]);
  useEffect(() => {
    engineRef.current?.setQuality(quality);
  }, [quality]);
  useEffect(() => {
    engineRef.current?.setOrthographic(ortho);
  }, [ortho]);

  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let resizeObserver: ResizeObserver | null = null;

    async function init() {
      if (!containerRef.current) return;
      setStatus("loading");
      setErrorMessage(null);
      setProgress(0);
      setProgressLabel("טוען מודל...");
      setPerf(null);
      setMeshes([]);
      setTextureCount(0);
      engineRef.current?.dispose();
      engineRef.current = null;

      const tAll = performance.now();
      try {
        const sources: ModelViewerSource[] = [
          { url, file, fileName, fileId, fileSize, role: inferRole(fileName) },
          ...companions,
        ].filter((s) => s.file || s.fileId || s.url);

        if (!sources.length) throw new Error("חסר מקור למודל");

        const w = containerRef.current.clientWidth || 800;
        const h = containerRef.current.clientHeight || 480;
        const created = await createDentalViewerEngine({
          canvasParent: containerRef.current,
          width: w,
          height: h,
        });
        if (disposed) {
          created.engine.dispose();
          return;
        }

        const meshSources = sources.filter((s) => !isMaterialCompanionName(s.fileName));
        const materialCompanions = sources
          .filter((s) => isMaterialCompanionName(s.fileName))
          .map((s) => ({
            fileName: s.fileName,
            file: s.file,
            fileId: s.fileId,
            url: s.url,
          }));

        if (!meshSources.length) throw new Error("חסר מקור למודל");

        const perSource = Math.floor(90 / meshSources.length);
        let base = 0;
        const timingsAcc: ModelPerfTimings[] = [];
        let texturesLoaded = 0;

        for (let i = 0; i < meshSources.length; i++) {
          const src = meshSources[i]!;
          const role = src.role ?? inferRole(src.fileName);
          const id = src.fileId || `src-${i}-${src.fileName}`;
          const sidecars = i === 0 ? materialCompanions : [];

          if (src.file || src.fileId) {
            const result = await loadDentalModel({
              fileId: src.fileId || `local:${src.fileName}`,
              fileName: src.fileName,
              fileSize: src.fileSize,
              localFile: src.file,
              materialCompanions: sidecars,
              onProgress: (pct, label) => {
                if (disposed) return;
                setProgress(base + Math.round((pct / 100) * perSource));
                if (label) setProgressLabel(label);
              },
            });
            timingsAcc.push(result.timings);
            texturesLoaded += result.textureCount;
            if (result.mode === "geometry") {
              const g = result.geometry;
              created.addGeometryGroup({
                id,
                name: src.label || src.fileName,
                role,
                positions: g.positions,
                normals: g.normals ?? null,
                colors: g.colors ?? null,
                indices: g.indices ?? null,
                center: g.meta.center,
                maxDim: g.meta.maxDim,
                hasVertexColors: g.meta.hasVertexColors,
              });
            } else {
              created.addObject3D({
                id,
                name: src.label || src.fileName,
                role,
                object: result.object,
              });
            }
          } else if (src.url) {
            setProgressLabel(`מוריד ${src.fileName}...`);
            const res = await fetch(src.url, { credentials: "include", redirect: "follow" });
            if (!res.ok) throw new Error("טעינת הקובץ נכשלה");
            const buffer = await res.arrayBuffer();
            const file = new File([buffer], src.fileName);
            const result = await loadDentalModel({
              fileId: `url:${src.fileName}`,
              fileName: src.fileName,
              fileSize: buffer.byteLength,
              localFile: file,
              materialCompanions: sidecars,
              onProgress: (pct, label) => {
                if (disposed) return;
                setProgress(base + Math.round((pct / 100) * perSource));
                if (label) setProgressLabel(label);
              },
            });
            timingsAcc.push(result.timings);
            texturesLoaded += result.textureCount;
            if (result.mode === "geometry") {
              const g = result.geometry;
              created.addGeometryGroup({
                id,
                name: src.label || src.fileName,
                role,
                positions: g.positions,
                normals: g.normals ?? null,
                colors: g.colors ?? null,
                indices: g.indices ?? null,
                center: g.meta.center,
                maxDim: g.meta.maxDim,
                hasVertexColors: g.meta.hasVertexColors,
              });
            } else {
              created.addObject3D({
                id,
                name: src.label || src.fileName,
                role,
                object: result.object,
              });
            }
          }
          base += perSource;
        }
        if (!disposed) setTextureCount(texturesLoaded);

        if (disposed) {
          created.engine.dispose();
          return;
        }

        setProgress(96);
        setProgressLabel("בונה סצנה...");
        created.finalizeScene();
        engineRef.current = created.engine;
        setMeshes(created.engine.getMeshes());

        resizeObserver = new ResizeObserver(() => {
          if (!containerRef.current || !engineRef.current) return;
          engineRef.current.resize(
            containerRef.current.clientWidth,
            containerRef.current.clientHeight,
          );
        });
        resizeObserver.observe(containerRef.current);

        let lastFpsUi = 0;
        const tick = () => {
          if (disposed) return;
          raf = requestAnimationFrame(tick);
          engineRef.current?.renderFrame();
          const now = performance.now();
          if (now - lastFpsUi >= 500) {
            lastFpsUi = now;
            setFps(engineRef.current?.getFps() ?? 0);
          }
        };
        tick();

        const primary = timingsAcc[0];
        const totalMs = Math.round(performance.now() - tAll);
        setLoadMs(totalMs);
        if (primary) {
          setPerf({ ...primary, totalMs, renderMs: Math.max(0, totalMs - primary.totalMs) });
        }

        setProgress(100);
        setProgressLabel("מוכן");
        setStatus("ready");
        onLoaded?.();
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
      cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      engineRef.current?.dispose();
      engineRef.current = null;
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

  const stats = useMemo(() => {
    const triangles = meshes.reduce((s, m) => s + m.triangles, 0);
    const vertices = meshes.reduce((s, m) => s + m.vertices, 0);
    return { triangles, vertices, parts: meshes.length };
  }, [meshes]);

  const cameraBtns: { id: CameraPreset; label: string }[] = [
    { id: "front", label: "Front" },
    { id: "back", label: "Back" },
    { id: "left", label: "Left" },
    { id: "right", label: "Right" },
    { id: "top", label: "Top" },
    { id: "bottom", label: "Bottom" },
    { id: "isometric", label: "Iso" },
  ];

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative w-full h-full min-h-[360px] overflow-hidden rounded-lg bg-[#0b1220] text-slate-100",
        isFullscreen && "min-h-screen rounded-none",
        className,
      )}
    >
      <div ref={containerRef} className="absolute inset-0" />

      {/* Top bar */}
      {showToolbar && (
        <div className="absolute top-0 inset-x-0 z-20 flex flex-wrap items-center gap-1 border-b border-white/10 bg-[#0b1220]/85 px-2 py-1.5 backdrop-blur-md">
          <span className="text-[11px] font-semibold text-opal-gold px-1 truncate max-w-[180px]">
            OPAL 3D
          </span>
          <Tool
            title="סיבוב אוטומטי"
            active={autoRotate}
            onClick={() => setAutoRotate((v) => !v)}
          >
            <Box className="h-3.5 w-3.5" />
          </Tool>
          <Tool title="הקטן" onClick={() => zoomBy(1.15)}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Tool>
          <Tool title="הגדל" onClick={() => zoomBy(0.85)}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Tool>
          <Tool title="איפוס / Fit" onClick={() => { resetView(); engineRef.current?.fitToView(); }}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Tool>
          <Tool title="מרכז" onClick={() => engineRef.current?.centerModel()}>
            <Focus className="h-3.5 w-3.5" />
          </Tool>
          <Tool title="מסך מלא" onClick={() => void toggleFullscreen()}>
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Tool>
          <Sep />
          <Select
            value={shade}
            onChange={(v) => setShade(v as ViewerShade)}
            options={[
              ["original", "Original"],
              ["solid", "Solid"],
              ["wireframe", "Wireframe"],
              ["transparent", "Transparent"],
              ["xray", "X-Ray"],
              ["monochrome", "Mono"],
            ]}
          />
          <Select
            value={background}
            onChange={(v) => setBackground(v as ViewerBackground)}
            options={[
              ["dark", "Dark"],
              ["light", "Light"],
              ["gradient", "Gradient"],
              ["transparent", "Clear"],
            ]}
          />
          <Select
            value={lighting}
            onChange={(v) => setLighting(v as ViewerLighting)}
            options={[
              ["dental", "Dental"],
              ["studio", "Studio"],
              ["soft", "Soft"],
              ["strong", "Strong"],
              ["daylight", "Daylight"],
            ]}
          />
          <Select
            value={quality}
            onChange={(v) => setQuality(v as ViewerQuality)}
            options={[
              ["auto", "Auto"],
              ["high", "High"],
              ["medium", "Medium"],
              ["low", "Low"],
            ]}
          />
          <Tool title="Ortho / Perspective" active={ortho} onClick={() => setOrtho((v) => !v)}>
            <span className="text-[10px] font-bold">{ortho ? "2D" : "3D"}</span>
          </Tool>
          <Sep />
          <Tool title="עץ חלקים" active={showTree} onClick={() => setShowTree((v) => !v)}>
            <Layers className="h-3.5 w-3.5" />
          </Tool>
          <Tool title="מידע" active={showInfo} onClick={() => setShowInfo((v) => !v)}>
            <Info className="h-3.5 w-3.5" />
          </Tool>
          {showPerf && (
            <Tool title="ביצועים" active={showPerfPanel} onClick={() => setShowPerfPanel((v) => !v)}>
              <Gauge className="h-3.5 w-3.5" />
            </Tool>
          )}
          <Tool title="צילום PNG" onClick={() => capture("png")}>
            <Camera className="h-3.5 w-3.5" />
          </Tool>
          <Tool title="צילום JPEG" onClick={() => capture("jpeg")}>
            <ImageIcon className="h-3.5 w-3.5" />
          </Tool>
          <Tool title="צילום שקוף" onClick={() => capture("png", true)}>
            <Sun className="h-3.5 w-3.5" />
          </Tool>
        </div>
      )}

      {/* Camera presets */}
      {showToolbar && status === "ready" && (
        <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 flex-wrap justify-center gap-1 rounded-xl border border-white/10 bg-[#0b1220]/90 px-2 py-1.5 backdrop-blur">
          {cameraBtns.map((c) => (
            <button
              key={c.id}
              type="button"
              title={c.label}
              onClick={() => engineRef.current?.setCameraPreset(c.id)}
              className="rounded-md px-2 py-1 text-[10px] font-semibold text-slate-200 hover:bg-white/10"
            >
              {c.label}
            </button>
          ))}
          <button
            type="button"
            className="rounded-md px-2 py-1 text-[10px] font-semibold text-opal-gold hover:bg-opal-gold/15"
            onClick={() => engineRef.current?.showAllMeshes()}
          >
            Show All
          </button>
        </div>
      )}

      {/* Scene tree */}
      {showTree && status === "ready" && (
        <div className="absolute top-12 right-3 z-20 w-56 rounded-xl border border-white/10 bg-[#0b1220]/95 p-3 text-xs shadow-xl">
          <p className="mb-2 font-bold text-slate-100">Scene Tree</p>
          <div className="space-y-1.5 max-h-64 overflow-auto">
            {meshes.map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-slate-300 hover:text-white"
                  onClick={() => {
                    engineRef.current?.setMeshVisible(m.id, !m.visible);
                    setMeshes(engineRef.current?.getMeshes() ?? []);
                  }}
                  title={m.visible ? "Hide" : "Show"}
                >
                  {m.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  className="flex-1 truncate text-right text-slate-200 hover:text-opal-gold"
                  onClick={() => {
                    engineRef.current?.isolateMesh(m.id);
                    setMeshes(engineRef.current?.getMeshes() ?? []);
                  }}
                  title="Isolate"
                >
                  {partLabel(m.name, m.role)}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Info / perf */}
      {(showInfo || showPerfPanel) && status === "ready" && (
        <div className="absolute top-12 left-3 z-20 min-w-[200px] rounded-xl border border-white/10 bg-[#0b1220]/95 p-3 text-[11px] font-mono text-slate-200 space-y-1">
          {showInfo && (
            <>
              <p className="font-bold text-xs text-white mb-1">Model Info</p>
              <Row label="File" value={fileName} />
              <Row label="Size" value={formatBytes(totalBytes)} />
              <Row label="Parts" value={String(stats.parts)} />
              <Row label="Vertices" value={stats.vertices.toLocaleString()} />
              <Row label="Faces" value={stats.triangles.toLocaleString()} />
              <Row label="Textures" value={String(textureCount)} />
              <Row label="Load" value={loadMs != null ? `${loadMs}ms` : "—"} />
              <Row label="FPS" value={String(fps)} />
              {perf?.textureMs != null && <Row label="Tex load" value={`${perf.textureMs}ms`} />}
            </>
          )}
          {showPerfPanel && perf && (
            <>
              <p className="font-bold text-xs text-white mt-2 mb-1">Perf</p>
              <Row label="API" value={`${perf.apiMs}ms`} />
              <Row label="Storage" value={`${perf.storageMs}ms`} />
              <Row
                label="Parse"
                value={perf.cacheHit ? `cache/${perf.source}` : `${perf.parseMs}ms`}
              />
              <Row label="Total" value={`${perf.totalMs}ms`} />
            </>
          )}
        </div>
      )}

      {status === "loading" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-[#0b1220]/92 px-6">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-opal-gold border-t-transparent" />
          <p className="text-sm font-medium text-slate-100">{progressLabel}</p>
          <p className="text-xs text-slate-400 truncate max-w-full">{fileName}</p>
          <p className="text-[11px] text-slate-500">{formatBytes(totalBytes)}</p>
          <div className="w-56 h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-opal-gold transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs font-mono text-opal-gold">{progress}%</p>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0b1220] p-6 text-center text-sm text-slate-300">
          {errorMessage || "לא ניתן לטעון את המודל התלת־ממדי"}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-400">{label}</span>
      <span className="text-right truncate max-w-[140px]">{value}</span>
    </div>
  );
}

function Sep() {
  return <span className="mx-0.5 h-4 w-px bg-white/15" />;
}

function Tool({
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
      className={cn(
        "h-7 px-2 text-slate-200 hover:bg-white/10 hover:text-white",
        active && "bg-opal-gold/20 text-opal-gold",
      )}
    >
      {children}
    </Button>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 rounded-md border border-white/10 bg-white/5 px-1.5 text-[10px] text-slate-100 outline-none"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v} className="bg-slate-900">
          {label}
        </option>
      ))}
    </select>
  );
}
