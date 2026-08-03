"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AbstractMesh, ArcRotateCamera, Engine, Scene } from "@babylonjs/core";
import { PointerEventTypes } from "@babylonjs/core";
import { cn } from "@/lib/utils";
import {
  applyCameraPreset,
  createOrbitCamera,
  fitCameraToMeshes,
  resetCamera,
  setProjection,
} from "./Camera";
import { setupLights, updateLightsForTheme, type ViewerLights } from "./Lights";
import { loadAndPrepareModel } from "./LoadModel";
import { applyRenderMode } from "./Materials";
import { createMeasurementTool, type MeasurementTool } from "./Measurements";
import {
  startSceneOptimizer,
  type PerfHandle,
} from "./Performance";
import {
  createViewerScene,
  disposeViewerScene,
  setSceneTheme,
  type ViewerSceneBundle,
} from "./Scene";
import { captureScreenshot } from "./Thumbnail";
import { Toolbar } from "./Toolbar";
import type {
  OPAL3DViewerProps,
  ViewerProjection,
  ViewerRenderMode,
  ViewerTheme,
} from "./types";

/**
 * OPAL 3D Viewer V2 — Babylon.js engine shell.
 * Does not import or reuse the legacy Three.js viewer.
 */
export function Viewer({
  url,
  fileName,
  file,
  className,
  onError,
  onLoaded,
  showToolbar = true,
}: OPAL3DViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bundleRef = useRef<ViewerSceneBundle | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const lightsRef = useRef<ViewerLights | null>(null);
  const meshesRef = useRef<AbstractMesh[]>([]);
  const measureRef = useRef<MeasurementTool | null>(null);
  const perfRef = useRef<PerfHandle | null>(null);
  const loadGen = useRef(0);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("מכין Viewer...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [theme, setTheme] = useState<ViewerTheme>("dark");
  const [projection, setProjectionState] = useState<ViewerProjection>("perspective");
  const [renderMode, setRenderMode] = useState<ViewerRenderMode>("shaded");
  const [measuring, setMeasuring] = useState(false);
  const [measureLabel, setMeasureLabel] = useState<string | null>(null);
  const [vertCount, setVertCount] = useState(0);

  const getScene = () => bundleRef.current?.scene ?? null;
  const getEngine = () => bundleRef.current?.engine ?? null;

  // Init engine/scene once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bundle = createViewerScene(canvas, "dark");
    bundleRef.current = bundle;
    const camera = createOrbitCamera(bundle.scene, canvas);
    cameraRef.current = camera;
    lightsRef.current = setupLights(bundle.scene, "dark");

    measureRef.current = createMeasurementTool(
      bundle.scene,
      () => meshesRef.current,
      (mm) => setMeasureLabel(mm != null ? `${mm} mm` : null),
    );

    // Double-click → zoom to pick + center
    const dbl = bundle.scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERDOUBLETAP) return;
      const pick = bundle.scene.pick(bundle.scene.pointerX, bundle.scene.pointerY);
      if (!pick?.hit || !pick.pickedPoint || !cameraRef.current) return;
      cameraRef.current.setTarget(pick.pickedPoint);
      cameraRef.current.radius = Math.max(cameraRef.current.radius * 0.45, 0.2);
    });

    bundle.engine.runRenderLoop(() => {
      bundle.scene.render();
    });

    const onResize = () => bundle.engine.resize();
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      bundle.scene.onPointerObservable.remove(dbl);
      measureRef.current?.dispose();
      measureRef.current = null;
      perfRef.current?.stop();
      perfRef.current = null;
      disposeViewerScene(bundleRef.current);
      bundleRef.current = null;
      cameraRef.current = null;
      lightsRef.current = null;
      meshesRef.current = [];
    };
  }, []);

  // Load model when source changes — never show until prepare finishes
  useEffect(() => {
    const scene = getScene();
    const engine = getEngine();
    const camera = cameraRef.current;
    if (!scene || !engine || !camera) return;

    const gen = ++loadGen.current;
    setStatus("loading");
    setProgress(0);
    setPhase("טוען...");
    setErrorMessage(null);

    // Clear previous meshes
    for (const m of meshesRef.current) {
      try {
        m.dispose(false, true);
      } catch {
        /* ignore */
      }
    }
    meshesRef.current = [];
    scene.getTransformNodeByName("opalModelRoot")?.dispose();

    let cancelled = false;

    (async () => {
      try {
        const prepared = await loadAndPrepareModel({
          scene,
          engine,
          fileName,
          file,
          url,
          onProgress: (p) => {
            if (cancelled || gen !== loadGen.current) return;
            setProgress(p.progress);
            setPhase(p.phase);
          },
        });

        if (cancelled || gen !== loadGen.current) {
          prepared.root.dispose();
          return;
        }

        meshesRef.current = prepared.meshes;
        setVertCount(prepared.vertexCount);
        applyRenderMode(prepared.meshes, renderMode);
        fitCameraToMeshes(camera, prepared.meshes);

        perfRef.current?.stop();
        perfRef.current = startSceneOptimizer(scene, 45);

        setStatus("ready");
        setProgress(100);
        setPhase("מוכן");
        onLoaded?.();
      } catch (err) {
        if (cancelled || gen !== loadGen.current) return;
        const msg = err instanceof Error ? err.message : "טעינת המודל נכשלה";
        setStatus("error");
        setErrorMessage(msg);
        onError?.(msg);
      }
    })();

    return () => {
      cancelled = true;
    };
    // renderMode applied separately — don't reload on mode change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, file, fileName]);

  useEffect(() => {
    applyRenderMode(meshesRef.current, renderMode);
  }, [renderMode]);

  useEffect(() => {
    const scene = getScene();
    if (!scene || !lightsRef.current) return;
    setSceneTheme(scene, theme);
    updateLightsForTheme(lightsRef.current, theme);
    scene.environmentIntensity = theme === "dark" ? 0.55 : 0.7;
  }, [theme]);

  useEffect(() => {
    if (!cameraRef.current) return;
    setProjection(cameraRef.current, projection);
  }, [projection]);

  const onHome = useCallback(() => {
    if (!cameraRef.current) return;
    applyCameraPreset(cameraRef.current, "home", meshesRef.current);
  }, []);

  const onReset = useCallback(() => {
    if (!cameraRef.current) return;
    resetCamera(cameraRef.current, meshesRef.current);
    setProjectionState("perspective");
    setRenderMode("shaded");
  }, []);

  const onFullscreen = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen();
  }, []);

  const onScreenshot = useCallback(() => {
    const engine = getEngine();
    const scene = getScene();
    if (!engine || !scene) return;
    void captureScreenshot(engine, scene).then((data) => {
      if (!data) return;
      const a = document.createElement("a");
      a.href = data;
      a.download = `${fileName.replace(/\.[^.]+$/, "") || "model"}-opal-v2.png`;
      a.click();
    });
  }, [fileName]);

  const onToggleMeasure = useCallback(() => {
    const tool = measureRef.current;
    if (!tool) return;
    if (tool.enabled) {
      tool.disable();
      setMeasuring(false);
      setMeasureLabel(null);
    } else {
      tool.enable();
      setMeasuring(true);
    }
  }, []);

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative h-full w-full min-h-[360px] overflow-hidden rounded-xl bg-slate-950",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        className={cn(
          "absolute inset-0 h-full w-full outline-none touch-none",
          status !== "ready" && "opacity-0 pointer-events-none",
        )}
      />

      {status === "loading" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-slate-950 text-white">
          <div className="h-10 w-10 rounded-full border-2 border-opal-gold border-t-transparent animate-spin" />
          <p className="text-sm font-medium">{phase}</p>
          <div className="w-48 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-opal-gold transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[11px] text-white/50">OPAL 3D Viewer V2 · Babylon.js</p>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-slate-950 text-white p-6 text-center">
          <p className="font-semibold text-red-300">שגיאה בטעינת המודל</p>
          <p className="text-sm text-white/70">{errorMessage}</p>
        </div>
      )}

      {status === "ready" && showToolbar && (
        <Toolbar
          theme={theme}
          projection={projection}
          renderMode={renderMode}
          measuring={measuring}
          measureLabel={measureLabel}
          onTheme={setTheme}
          onProjection={setProjectionState}
          onRenderMode={setRenderMode}
          onPreset={(p) => {
            if (!cameraRef.current) return;
            applyCameraPreset(cameraRef.current, p, meshesRef.current);
          }}
          onHome={onHome}
          onReset={onReset}
          onFullscreen={onFullscreen}
          onScreenshot={onScreenshot}
          onToggleMeasure={onToggleMeasure}
        />
      )}

      {status === "ready" && (
        <div className="absolute bottom-14 left-2 z-20 rounded-md bg-black/40 px-2 py-1 text-[10px] text-white/70">
          V2 · {vertCount.toLocaleString()} verts · גלגלת Zoom · שמאל Rotate · ימין Pan
        </div>
      )}
    </div>
  );
}

// Silence unused type imports in some bundlers
export type { Engine, Scene };
