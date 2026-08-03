"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plane, PointerEventTypes, type ArcRotateCamera } from "@babylonjs/core";
import { cn } from "@/lib/utils";
import {
  applyCameraPreset,
  centerAndScaleScene,
  createOrbitCamera,
  fitCameraToMeshes,
  resetCamera,
  setExplodeFactor,
  setProjection,
} from "./Camera";
import { createAxisGizmo, type AxisGizmo } from "./Axis";
import { BottomToolbar } from "./BottomToolbar";
import { setupEnvironment, updateEnvironmentTheme, type EnvironmentHandle } from "./Environment";
import {
  applyLayerVisibility,
  buildLayerStates,
  layerVisibilityMap,
  toggleLayer,
} from "./Layers";
import { setupLights, updateLightsForTheme, type ViewerLights } from "./Lights";
import {
  disposeSceneMeshes,
  loadDentalScene,
  type LoadedSceneMesh,
} from "./Loaders";
import { applyRenderMode } from "./Materials";
import { createMeasurementTool, type MeasurementTool } from "./Measurements";
import {
  createViewerScene,
  disposeViewerScene,
  rebuildOctree,
  setSceneTheme,
  type ViewerSceneBundle,
} from "./Scene";
import { captureScreenshot4K, downloadDataUrl } from "./Screenshot";
import { Toolbar } from "./Toolbar";
import type {
  OPAL3DViewerProps,
  SceneLayerId,
  SceneLayerState,
  ViewerProjection,
  ViewerRenderMode,
  ViewerTheme,
} from "./types";
import { formatBytes, mergeSceneAssets } from "./Utils";

/**
 * OPAL 3D Viewer V3 — Dental Scene Viewer (Exocad-style).
 * Babylon.js only. Does not reuse the legacy Three.js viewer.
 */
export function Viewer({
  sceneFiles,
  url,
  fileName,
  file,
  fileId,
  fileSize,
  className,
  onError,
  onLoaded,
  showToolbar = true,
  showLayers = true,
}: OPAL3DViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bundleRef = useRef<ViewerSceneBundle | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const lightsRef = useRef<ViewerLights | null>(null);
  const envRef = useRef<EnvironmentHandle | null>(null);
  const axisRef = useRef<AxisGizmo | null>(null);
  const itemsRef = useRef<LoadedSceneMesh[]>([]);
  const measureRef = useRef<MeasurementTool | null>(null);
  const loadGen = useRef(0);
  const sectionPlaneRef = useRef<Plane | null>(null);

  const assets = useMemo(
    () => mergeSceneAssets({ sceneFiles, url, fileName, file, fileId, fileSize }),
    [sceneFiles, url, fileName, file, fileId, fileSize],
  );

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("מכין Dental Scene...");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [theme, setTheme] = useState<ViewerTheme>("dark");
  const [projection, setProjectionState] = useState<ViewerProjection>("perspective");
  const [renderMode, setRenderMode] = useState<ViewerRenderMode>("shaded");
  const [measuring, setMeasuring] = useState(false);
  const [measureLabel, setMeasureLabel] = useState<string | null>(null);
  const [layers, setLayers] = useState<SceneLayerState[]>([]);
  const [vertCount, setVertCount] = useState(0);
  const [explodeOn, setExplodeOn] = useState(false);
  const [sectionOn, setSectionOn] = useState(false);

  const meshes = () => itemsRef.current.map((i) => i.mesh);

  // Init engine once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bundle = createViewerScene(canvas, "dark");
    bundleRef.current = bundle;
    const camera = createOrbitCamera(bundle.scene, canvas);
    cameraRef.current = camera;
    lightsRef.current = setupLights(bundle.scene, "dark");
    envRef.current = setupEnvironment(bundle.scene, "dark");
    axisRef.current = createAxisGizmo(bundle.scene);

    measureRef.current = createMeasurementTool(
      bundle.scene,
      () => itemsRef.current.map((i) => i.mesh),
      (mm) => setMeasureLabel(mm != null ? `${mm} mm` : null),
    );

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
      axisRef.current?.dispose();
      axisRef.current = null;
      disposeSceneMeshes(itemsRef.current);
      itemsRef.current = [];
      disposeViewerScene(bundleRef.current);
      bundleRef.current = null;
      cameraRef.current = null;
      lightsRef.current = null;
      envRef.current = null;
    };
  }, []);

  // Load full dental scene when assets change
  useEffect(() => {
    const scene = bundleRef.current?.scene;
    const camera = cameraRef.current;
    if (!scene || !camera) return;
    if (!assets.length) {
      setStatus("error");
      setErrorMessage("אין קבצי מודל בסצנה");
      onError?.("אין קבצי מודל בסצנה");
      return;
    }

    const gen = ++loadGen.current;
    setStatus("loading");
    setProgress(0);
    setPhase("טוען הזמנה...");
    setErrorMessage(null);
    setExplodeOn(false);
    setSectionOn(false);

    disposeSceneMeshes(itemsRef.current);
    itemsRef.current = [];
    scene.getTransformNodeByName("opalDentalRoot")?.dispose();

    let cancelled = false;

    (async () => {
      try {
        setPhase("Load All Files");
        const loaded = await loadDentalScene(scene, assets, (p, pct) => {
          if (cancelled || gen !== loadGen.current) return;
          setPhase(p);
          setProgress(pct);
        });
        if (cancelled || gen !== loadGen.current) {
          disposeSceneMeshes(loaded);
          return;
        }

        setPhase("Center Scene");
        setProgress(94);
        const meshList = loaded.map((l) => l.mesh);
        centerAndScaleScene(meshList);

        setPhase("Fit Camera");
        setProgress(97);
        fitCameraToMeshes(camera, meshList);
        rebuildOctree(scene);

        itemsRef.current = loaded;
        const layerStates = buildLayerStates(loaded);
        setLayers(layerStates);
        setVertCount(loaded.reduce((s, l) => s + l.vertexCount, 0));
        applyRenderMode(meshList, renderMode);

        setProgress(100);
        setPhase("מוכן");
        setStatus("ready");
        onLoaded?.();
      } catch (err) {
        if (cancelled || gen !== loadGen.current) return;
        const msg = err instanceof Error ? err.message : "שגיאת טעינת סצנה";
        setErrorMessage(msg);
        setStatus("error");
        onError?.(msg);
      }
    })();

    return () => {
      cancelled = true;
    };
    // renderMode intentionally omitted — applied separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets]);

  const onLayerToggle = useCallback((id: SceneLayerId) => {
    setLayers((prev) => {
      const next = toggleLayer(prev, id);
      applyLayerVisibility(itemsRef.current, layerVisibilityMap(next));
      return next;
    });
  }, []);

  const handleTheme = useCallback((t: ViewerTheme) => {
    setTheme(t);
    const scene = bundleRef.current?.scene;
    if (!scene) return;
    setSceneTheme(scene, t);
    if (lightsRef.current) updateLightsForTheme(lightsRef.current, t);
    if (envRef.current) updateEnvironmentTheme(envRef.current, scene, t);
  }, []);

  const handleProjection = useCallback((p: ViewerProjection) => {
    setProjectionState(p);
    if (cameraRef.current) setProjection(cameraRef.current, p);
  }, []);

  const handleRenderMode = useCallback((m: ViewerRenderMode) => {
    setRenderMode(m);
    applyRenderMode(meshes(), m);
  }, []);

  const handleScreenshot = useCallback(async () => {
    const engine = bundleRef.current?.engine;
    const scene = bundleRef.current?.scene;
    if (!engine || !scene) return;
    try {
      const data = await captureScreenshot4K(engine, scene, {
        transparent: true,
        width: 3840,
        height: 2160,
      });
      downloadDataUrl(data, `opal-scene-${Date.now()}.png`);
    } catch (err) {
      console.warn("[OPAL3DViewer] screenshot failed", err);
    }
  }, []);

  const handleFullscreen = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen();
  }, []);

  const handleExplode = useCallback(() => {
    setExplodeOn((on) => {
      const next = !on;
      setExplodeFactor(meshes(), next ? 1 : 0);
      return next;
    });
  }, []);

  const handleSection = useCallback(() => {
    const scene = bundleRef.current?.scene;
    if (!scene) return;
    setSectionOn((on) => {
      const next = !on;
      if (next) {
        const plane = new Plane(0, 1, 0, 0);
        sectionPlaneRef.current = plane;
        scene.clipPlane = plane;
      } else {
        scene.clipPlane = null;
        sectionPlaneRef.current = null;
      }
      return next;
    });
  }, []);

  return (
    <div
      ref={wrapRef}
      className={cn("relative w-full h-full min-h-[420px] bg-[#141618] overflow-hidden", className)}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full outline-none touch-none" />

      {showToolbar && status === "ready" && (
        <>
          <Toolbar
            theme={theme}
            projection={projection}
            renderMode={renderMode}
            measuring={measuring}
            explode={explodeOn}
            section={sectionOn}
            onHome={() => cameraRef.current && applyCameraPreset(cameraRef.current, "home", meshes())}
            onProjection={handleProjection}
            onRenderMode={handleRenderMode}
            onTheme={handleTheme}
            onMeasure={() => {
              setMeasuring((v) => {
                const next = !v;
                measureRef.current?.setEnabled(next);
                return next;
              });
            }}
            onScreenshot={() => void handleScreenshot()}
            onFullscreen={handleFullscreen}
            onReset={() => cameraRef.current && resetCamera(cameraRef.current, meshes())}
            onExplode={handleExplode}
            onSection={handleSection}
          />
          <BottomToolbar
            onPreset={(p) => cameraRef.current && applyCameraPreset(cameraRef.current, p, meshes())}
          />
        </>
      )}

      {showLayers && status === "ready" && layers.length > 0 && (
        <aside className="absolute top-12 left-2 z-20 w-44 rounded-xl bg-black/55 backdrop-blur border border-white/10 p-2 text-white">
          <p className="text-[11px] font-semibold mb-1.5 text-white/80">Layers</p>
          <ul className="space-y-1 max-h-[50vh] overflow-auto">
            {layers.map((l) => (
              <li key={l.id}>
                <label className="flex items-center gap-2 text-[12px] cursor-pointer hover:text-opal-gold">
                  <input
                    type="checkbox"
                    checked={l.visible}
                    onChange={() => onLayerToggle(l.id)}
                    className="rounded border-white/30"
                  />
                  <span className="flex-1 truncate">{l.label}</span>
                  <span className="text-white/40 text-[10px]">{l.count}</span>
                </label>
              </li>
            ))}
          </ul>
        </aside>
      )}

      {status === "ready" && (
        <div className="absolute top-2 right-2 z-20 text-[10px] text-white/50 bg-black/40 rounded px-2 py-1">
          {itemsRef.current.length || assets.length} meshes · {vertCount.toLocaleString()} verts
          {fileSize ? ` · ${formatBytes(fileSize)}` : ""}
        </div>
      )}

      {measuring && measureLabel && (
        <div className="absolute top-14 right-2 z-20 rounded-lg bg-amber-400 text-slate-900 text-xs font-semibold px-2 py-1">
          {measureLabel}
        </div>
      )}

      {status === "loading" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50">
          <div className="text-center text-white px-6">
            <div className="h-10 w-10 mx-auto animate-spin rounded-full border-4 border-opal-gold border-t-transparent" />
            <p className="text-sm mt-3">{phase}</p>
            <div className="mt-2 h-1.5 w-48 mx-auto rounded-full bg-white/15 overflow-hidden">
              <div
                className="h-full bg-opal-gold transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[11px] text-white/50 mt-1">{progress}%</p>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-6">
          <div className="text-center text-white max-w-sm">
            <p className="font-medium">שגיאה בטעינת Dental Scene</p>
            <p className="text-sm text-white/60 mt-2">{errorMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
