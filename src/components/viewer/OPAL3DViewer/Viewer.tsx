"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plane, TransformNode, type AbstractMesh } from "@babylonjs/core";
import { cn } from "@/lib/utils";
import { createAxisGizmo, type AxisGizmo } from "./Axis";
import { BottomToolbar } from "./BottomToolbar";
import { CameraController, computeSceneBounds } from "./Camera";
import { runDentalPipeline } from "./DentalPipeline";
import {
  applyAutoExposure,
  rotateEnvironment,
  setupEnvironment,
  setViewerBackground,
  type EnvironmentHandle,
} from "./Environment";
import { createDentalGrid, type DentalGrid } from "./Grid";
import {
  applyLayerVisibility,
  buildLayerStates,
  layerVisibilityMap,
  toggleLayer,
} from "./Layers";
import {
  rotateLights,
  setupLights,
  updateLightsForBackground,
  type ViewerLights,
} from "./Lights";
import {
  disposeSceneMeshes,
  loadDentalScene,
  type LoadedSceneMesh,
} from "./Loaders";
import {
  DEFAULT_MANUAL_ALIGN,
  ManualAlignmentPanel,
  type ManualAlignValues,
} from "./ManualAlignment";
import { applyRenderMode, freezeSceneMeshes } from "./Materials";
import { createMeasurementTool, type MeasurementTool } from "./Measurements";
import { applyDentalPreset, viewModeToPresetId } from "./Presets";
import {
  applyManualAsBaseline,
  resetManualNode,
  setManualTransform,
  type AssetNode,
} from "./Registration";
import {
  createViewerScene,
  disposeViewerScene,
  freezeScenePerformance,
  unfreezeScenePerformance,
  type ViewerSceneBundle,
} from "./Scene";
import { SceneTree } from "./SceneTree";
import { captureScreenshot4K, downloadDataUrl } from "./Screenshot";
import { createStudioFloor, type StudioFloorHandle } from "./StudioFloor";
import { Toolbar, type AdvancedAction } from "./Toolbar";
import type {
  DentalViewMode,
  OPAL3DViewerProps,
  SceneLayerId,
  SceneTreeNode,
  SceneWarning,
  ViewerBackground,
  ViewerCameraPreset,
  ViewerProjection,
  ViewerRenderMode,
} from "./types";
import { formatTriangleCount, formatVertexCount, mergeSceneAssets } from "./Utils";

const MOUSE_HELP_KEY = "opal3d-v3-mouse-help-seen";

/**
 * OPAL 3D Viewer V5 — Dental Rendering Pipeline (Exocad-class display).
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
  onClose,
  onFullscreen,
  isFullscreen,
  onOpenExternal,
  onDownload,
}: OPAL3DViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const bundleRef = useRef<ViewerSceneBundle | null>(null);
  const camCtrlRef = useRef<CameraController | null>(null);
  const lightsRef = useRef<ViewerLights | null>(null);
  const envRef = useRef<EnvironmentHandle | null>(null);
  const axisRef = useRef<AxisGizmo | null>(null);
  const gridRef = useRef<DentalGrid | null>(null);
  const floorRef = useRef<StudioFloorHandle | null>(null);
  const measureRef = useRef<MeasurementTool | null>(null);
  const itemsRef = useRef<LoadedSceneMesh[]>([]);
  const assetNodesRef = useRef<AssetNode[]>([]);
  const rootRef = useRef<TransformNode | null>(null);
  const loadGen = useRef(0);

  const assets = useMemo(
    () => mergeSceneAssets({ sceneFiles, url, fileName, file, fileId, fileSize }),
    [sceneFiles, url, fileName, file, fileId, fileSize],
  );

  const assetsKey = useMemo(
    () => assets.map((a) => `${a.id}|${a.fileName}|${a.fileSize ?? 0}`).join(";"),
    [assets],
  );

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("Loading Dental Scene...");
  const [phaseDetail, setPhaseDetail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [projection, setProjectionState] = useState<ViewerProjection>("perspective");
  const [renderMode, setRenderMode] = useState<ViewerRenderMode>("shaded");
  const [viewMode, setViewMode] = useState<DentalViewMode>("dental");
  const [background, setBackground] = useState<ViewerBackground>("darkGray");
  const [layers, setLayers] = useState(buildLayerStates([]));
  const [treeNodes, setTreeNodes] = useState<SceneTreeNode[]>([]);
  const [vertCount, setVertCount] = useState(0);
  const [triCount, setTriCount] = useState(0);
  const [meshCount, setMeshCount] = useState(0);
  const [fps, setFps] = useState(60);
  const [regNote, setRegNote] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<SceneWarning[]>([]);
  const [gridVisible, setGridVisible] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValues, setManualValues] = useState<ManualAlignValues>(DEFAULT_MANUAL_ALIGN);
  const [manualTargetId, setManualTargetId] = useState<string | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [measureLabel, setMeasureLabel] = useState<string | null>(null);
  const [sectionOn, setSectionOn] = useState(false);
  const [viewPreset, setViewPreset] = useState<ViewerCameraPreset | null>("iso");
  const [alignTipOpen, setAlignTipOpen] = useState(false);
  const [showMouseHelp, setShowMouseHelp] = useState(false);

  const meshes = () => itemsRef.current.map((i) => i.mesh);

  const syncTree = useCallback(() => {
    setTreeNodes(
      itemsRef.current.map((item) => ({
        assetId: item.assetId,
        meshId: item.mesh.uniqueId.toString(),
        fileName: item.fileName,
        displayName: item.displayName || item.fileName,
        layer: item.layer,
        format: item.format,
        visible: item.mesh.isVisible && item.mesh.isEnabled(),
        locked: Boolean(item.mesh.metadata?.locked),
        vertexCount: item.vertexCount,
        hasTransform: Boolean(item.mesh.metadata?.hasTransform),
      })),
    );
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && !localStorage.getItem(MOUSE_HELP_KEY)) {
        setShowMouseHelp(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const bundle = createViewerScene(canvas, "dark");
    bundleRef.current = bundle;
    camCtrlRef.current = new CameraController(bundle.scene, canvas);
    lightsRef.current = setupLights(bundle.scene, "darkGray");
    envRef.current = setupEnvironment(bundle.scene, "darkGray");
    axisRef.current = createAxisGizmo(bundle.scene);
    gridRef.current = createDentalGrid(bundle.scene);
    gridRef.current.setVisible(false);
    try {
      floorRef.current = createStudioFloor(bundle.scene);
    } catch {
      floorRef.current = null;
    }
    measureRef.current = createMeasurementTool(
      bundle.scene,
      () => itemsRef.current.map((i) => i.mesh),
      (mm) => setMeasureLabel(mm == null ? null : `${mm} mm`),
    );

    let frame = 0;
    bundle.engine.runRenderLoop(() => {
      bundle.scene.render();
      frame++;
      if (frame % 30 === 0) {
        setFps(Math.round(bundle.engine.getFps()));
      }
    });

    const onResize = () => {
      bundle.engine.resize();
      camCtrlRef.current?.updateClipPlanes();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      measureRef.current?.dispose();
      measureRef.current = null;
      floorRef.current?.dispose();
      floorRef.current = null;
      gridRef.current?.dispose();
      gridRef.current = null;
      axisRef.current?.dispose();
      axisRef.current = null;
      camCtrlRef.current?.dispose();
      camCtrlRef.current = null;
      disposeSceneMeshes(itemsRef.current);
      itemsRef.current = [];
      assetNodesRef.current = [];
      rootRef.current = null;
      try {
        envRef.current?.dispose();
      } catch {
        /* ignore */
      }
      envRef.current = null;
      disposeViewerScene(bundleRef.current);
      bundleRef.current = null;
      lightsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!assetsKey) {
      setStatus("error");
      setErrorMessage("אין קבצי מודל בסצנה");
      onError?.("אין קבצי מודל בסצנה");
      return;
    }

    const gen = ++loadGen.current;
    let cancelled = false;

    setStatus("loading");
    setProgress(0);
    setPhase("Loading Dental Scene...");
    setPhaseDetail(null);
    setErrorMessage(null);
    setRegNote(null);
    setWarnings([]);
    setRenderMode("shaded");
    setProjectionState("perspective");
    setManualOpen(false);
    setMeasuring(false);
    setSectionOn(false);
    setMeasureLabel(null);
    measureRef.current?.setEnabled(false);
    measureRef.current?.clear();

    (async () => {
      try {
        let scene = bundleRef.current?.scene;
        let cam = camCtrlRef.current;
        for (let i = 0; i < 50 && (!scene || scene.isDisposed || !cam); i++) {
          await new Promise((r) => setTimeout(r, 40));
          if (cancelled || gen !== loadGen.current) return;
          scene = bundleRef.current?.scene;
          cam = camCtrlRef.current;
        }
        if (!scene || scene.isDisposed || !cam) {
          throw new Error("Viewer engine not ready");
        }

        cam.setProjection("perspective");
        scene.clipPlane = null;

        disposeSceneMeshes(itemsRef.current);
        itemsRef.current = [];
        assetNodesRef.current = [];
        scene.getTransformNodeByName("opalDentalRoot")?.dispose();
        rootRef.current = null;

        const withPrimary = assets.map((a, i) =>
          a.primary || i === 0 ? { ...a, primary: true } : a,
        );
        const loaded = await loadDentalScene(scene, withPrimary, (p, pct, detail) => {
          if (cancelled || gen !== loadGen.current) return;
          setPhase(p);
          setProgress(pct);
          setPhaseDetail(detail ?? null);
        });
        if (cancelled || gen !== loadGen.current || scene.isDisposed) {
          disposeSceneMeshes(loaded);
          return;
        }

        const root =
          (scene.getTransformNodeByName("opalDentalRoot") as TransformNode | null) ??
          new TransformNode("opalDentalRoot", scene);
        rootRef.current = root;

        // V5 Dental Rendering Pipeline (post-load) — pose-safe rigid transforms
        const pipeline = await runDentalPipeline({
          scene,
          root,
          items: loaded,
          assets: withPrimary,
          camera: cam,
          lights: lightsRef.current,
          floor: floorRef.current,
          onProgress: (phase, pct) => {
            if (cancelled || gen !== loadGen.current) return;
            setPhase(phase);
            setProgress(Math.round(pct));
          },
        });
        if (cancelled || gen !== loadGen.current || scene.isDisposed) {
          disposeSceneMeshes(pipeline.items);
          return;
        }

        assetNodesRef.current = pipeline.assetNodes;
        setRegNote(pipeline.registration.note);
        setWarnings(pipeline.warnings);
        itemsRef.current = pipeline.items;

        setLayers(buildLayerStates(pipeline.items));
        setVertCount(pipeline.items.reduce((s, l) => s + l.vertexCount, 0));
        setTriCount(
          pipeline.items.reduce((s, l) => {
            const idx = l.mesh.getTotalIndices?.() ?? 0;
            return s + Math.floor(idx / 3);
          }, 0),
        );
        setMeshCount(pipeline.items.length);
        syncTree();

        applyAutoExposure(scene, "darkGray");
        setViewMode("dental");
        setRenderMode("shaded");
        setBackground("darkGray");
        setViewPreset("iso");
        bundleRef.current?.engine.resize();

        setProgress(100);
        setPhase("Ready.");
        setPhaseDetail(null);
        setStatus("ready");
        onLoaded?.();
      } catch (err) {
        if (cancelled || gen !== loadGen.current) return;
        const msg = err instanceof Error ? err.message : "שגיאת טעינת סצנה";
        if (/disposed/i.test(msg)) return;
        setErrorMessage(msg);
        setStatus("error");
        onError?.(msg);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetsKey]);

  const findMesh = (meshId: string): AbstractMesh | undefined =>
    itemsRef.current.find((i) => i.mesh.uniqueId.toString() === meshId)?.mesh;

  const findAssetNode = (assetId: string) =>
    assetNodesRef.current.find((n) => n.assetId === assetId)?.node;

  const applyBackground = useCallback((bg: ViewerBackground) => {
    setBackground(bg);
    const scene = bundleRef.current?.scene;
    if (!scene || !envRef.current) return;
    setViewerBackground(envRef.current, scene, bg);
    applyAutoExposure(scene, bg);
    if (lightsRef.current) updateLightsForBackground(lightsRef.current, bg);
  }, []);

  const handleViewMode = useCallback(
    (mode: DentalViewMode) => {
      const scene = bundleRef.current?.scene;
      if (!scene) return;
      unfreezeScenePerformance(scene);
      const preset = applyDentalPreset(scene, itemsRef.current, viewModeToPresetId(mode));
      setViewMode(mode);
      setRenderMode(preset.renderMode);
      applyBackground(preset.background);
      freezeSceneMeshes(meshes());
      freezeScenePerformance(scene);
    },
    [applyBackground],
  );

  const dismissMouseHelp = useCallback(() => {
    setShowMouseHelp(false);
    try {
      localStorage.setItem(MOUSE_HELP_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleSection = useCallback(() => {
    const scene = bundleRef.current?.scene;
    if (!scene) return;
    setSectionOn((on) => {
      const next = !on;
      if (!next) {
        scene.clipPlane = null;
        return false;
      }
      const bounds = computeSceneBounds(meshes());
      const y = bounds?.center.y ?? 0;
      scene.clipPlane = new Plane(0, -1, 0, y);
      return true;
    });
  }, []);

  const handleAdvanced = useCallback(
    (action: AdvancedAction) => {
      if (action.startsWith("bg:")) {
        applyBackground(action.slice(3) as ViewerBackground);
        return;
      }
      switch (action) {
        case "manual":
          setManualOpen(true);
          if (!manualTargetId && assetNodesRef.current[0]) {
            setManualTargetId(assetNodesRef.current[0].assetId);
          }
          break;
        case "grid":
          setGridVisible((v) => {
            const next = !v;
            gridRef.current?.setVisible(next);
            return next;
          });
          break;
        case "wireframe":
          handleViewMode("wireframe");
          break;
        case "xray":
          handleViewMode(viewMode === "xray" ? "dental" : "xray");
          break;
        case "lighting":
          applyBackground(background === "darkGray" ? "lightGray" : "darkGray");
          break;
        case "transparency":
          setRenderMode((m) => {
            const next = m === "transparent" ? "shaded" : "transparent";
            applyRenderMode(meshes(), next);
            return next;
          });
          break;
        case "measurements":
          setMeasuring((on) => {
            const next = !on;
            measureRef.current?.setEnabled(next);
            if (!next) {
              measureRef.current?.clear();
              setMeasureLabel(null);
            }
            return next;
          });
          break;
        case "section":
          toggleSection();
          break;
        case "orthographic":
          setProjectionState("orthographic");
          camCtrlRef.current?.setProjection("orthographic");
          break;
        case "perspective":
          setProjectionState("perspective");
          camCtrlRef.current?.setProjection("perspective");
          break;
        case "rotateEnv":
          if (envRef.current) rotateEnvironment(envRef.current, Math.PI / 8);
          if (lightsRef.current) rotateLights(lightsRef.current, Math.PI / 8);
          break;
        default:
          break;
      }
    },
    [applyBackground, background, handleViewMode, manualTargetId, toggleSection, viewMode],
  );

  const applyManualLive = useCallback(
    (values: ManualAlignValues) => {
      setManualValues(values);
      const targetId =
        manualTargetId ??
        assetNodesRef.current[0]?.assetId ??
        itemsRef.current[0]?.assetId;
      if (!targetId) return;
      const node = findAssetNode(targetId);
      if (!node) return;
      setManualTransform(node, values);
      for (const item of itemsRef.current.filter((i) => i.assetId === targetId)) {
        item.mesh.computeWorldMatrix(true);
        item.mesh.refreshBoundingInfo(true, true);
      }
    },
    [manualTargetId],
  );

  const needsAlignment =
    warnings.some((w) => w.code === "NO_TRANSFORM") ||
    Boolean(regNote && /No manufacturer transforms/i.test(regNote));

  const alignTooltip =
    regNote ||
    warnings.find((w) => w.code === "NO_TRANSFORM")?.message ||
    "Scene may need manual alignment.";

  return (
    <div
      ref={wrapRef}
      className={cn("relative w-full h-full min-h-0 bg-[#16181c] overflow-hidden", className)}
      onPointerDown={showMouseHelp ? dismissMouseHelp : undefined}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full outline-none touch-none" />

      {showToolbar && status === "ready" && (
        <>
          <Toolbar
            onClose={onClose}
            onFullscreen={onFullscreen}
            isFullscreen={isFullscreen}
            onOpenExternal={onOpenExternal}
            onDownload={onDownload}
            projection={projection}
            renderMode={renderMode}
            viewMode={viewMode}
            background={background}
            gridVisible={gridVisible}
            measuring={measuring}
            sectionOn={sectionOn}
            manualOpen={manualOpen}
            onHome={() => {
              camCtrlRef.current?.home(meshes());
              setViewPreset("iso");
            }}
            onFitAll={() => {
              camCtrlRef.current?.fitAll(meshes(), 1.15, true);
              setViewPreset("iso");
            }}
            onScreenshot={() => {
              const engine = bundleRef.current?.engine;
              const scene = bundleRef.current?.scene;
              if (!engine || !scene) return;
              void captureScreenshot4K(engine, scene, {
                transparent: background === "transparent",
                width: 3840,
                height: 2160,
              }).then((data) => downloadDataUrl(data, `opal-scene-${Date.now()}.png`));
            }}
            onViewMode={handleViewMode}
            onAdvanced={handleAdvanced}
          />
          <BottomToolbar
            active={viewPreset}
            onPreset={(p) => {
              camCtrlRef.current?.applyPreset(p, meshes());
              setViewPreset(p);
            }}
          />
        </>
      )}

      {showLayers && status === "ready" && treeNodes.length > 0 && (
        <SceneTree
          nodes={treeNodes}
          layerVisibility={layerVisibilityMap(layers) as Record<string, boolean>}
          onToggleLayer={(id: SceneLayerId) => {
            setLayers((prev) => {
              const next = toggleLayer(prev, id);
              applyLayerVisibility(itemsRef.current, layerVisibilityMap(next));
              syncTree();
              return next;
            });
          }}
          onToggleVisible={(meshId) => {
            const mesh = findMesh(meshId);
            if (!mesh || mesh.metadata?.locked) return;
            mesh.setEnabled(!mesh.isEnabled());
            mesh.isVisible = mesh.isEnabled();
            syncTree();
          }}
        />
      )}

      {manualOpen && status === "ready" && (
        <ManualAlignmentPanel
          values={manualValues}
          targetLabel={
            itemsRef.current.find((i) => i.assetId === manualTargetId)?.displayName ||
            itemsRef.current[0]?.displayName ||
            "Selected mesh"
          }
          onChange={applyManualLive}
          onApply={() => {
            const id = manualTargetId ?? assetNodesRef.current[0]?.assetId;
            const node = id ? findAssetNode(id) : null;
            if (node) applyManualAsBaseline(node);
            setManualValues(DEFAULT_MANUAL_ALIGN);
          }}
          onReset={() => {
            const id = manualTargetId ?? assetNodesRef.current[0]?.assetId;
            const node = id ? findAssetNode(id) : null;
            if (node) resetManualNode(node);
            setManualValues(DEFAULT_MANUAL_ALIGN);
          }}
          onClose={() => setManualOpen(false)}
        />
      )}

      {status === "ready" && (
        <div className="absolute top-14 right-2 z-20 flex flex-col items-end gap-1 max-w-[200px]">
          <div className="text-[10px] leading-relaxed text-white/40 px-1 select-none text-right">
            <div>Meshes: {meshCount || itemsRef.current.length || assets.length}</div>
            <div>Vertices: {formatVertexCount(vertCount)}</div>
            <div>Triangles: {formatTriangleCount(triCount)}</div>
            <div>FPS: {fps}</div>
          </div>
          {needsAlignment && (
            <div className="relative">
              <button
                type="button"
                className="text-[10px] text-white/50 hover:text-white/75 px-1.5 py-0.5 rounded-[10px] bg-white/5 backdrop-blur-md border border-white/8"
                onClick={() => setAlignTipOpen((v) => !v)}
              >
                ℹ Alignment required
              </button>
              {alignTipOpen && (
                <div className="absolute top-full right-0 mt-1 w-52 rounded-[14px] border border-white/10 bg-white/5 backdrop-blur-xl px-2.5 py-2 text-[10px] leading-snug text-white/70 shadow-[0_8px_28px_rgba(0,0,0,0.28)]">
                  {alignTooltip}
                </div>
              )}
            </div>
          )}
          {measureLabel && (
            <div className="text-[10px] text-white/65 px-1.5 py-0.5 rounded-[10px] bg-white/5 backdrop-blur-md">
              {measureLabel}
            </div>
          )}
        </div>
      )}

      {status === "ready" && showMouseHelp && (
        <div className="absolute bottom-12 left-1/2 z-20 -translate-x-1/2 rounded-md bg-black/45 px-2.5 py-1 text-[10px] text-white/60 pointer-events-none">
          LMB Rotate · RMB Pan · Wheel Zoom
        </div>
      )}

      {status === "loading" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#16181c]">
          <div className="text-center text-white px-6 w-full max-w-sm">
            <div className="h-9 w-9 mx-auto animate-spin rounded-full border-2 border-white/25 border-t-white/80" />
            <p className="text-sm mt-3 font-medium text-white/85">{phase}</p>
            {phaseDetail && <p className="text-[11px] text-white/40 mt-1 truncate">{phaseDetail}</p>}
            <div className="mt-3 h-1 w-48 mx-auto rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-white/55 transition-all" style={{ width: `${progress}%` }} />
            </div>
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
