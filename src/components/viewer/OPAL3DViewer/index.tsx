"use client";

/**
 * OPAL 3D Viewer V5 — Dental Rendering Pipeline
 * Pose-safe post-load pipeline · Soft HDR studio · Glass minimal UI
 * Does not alter File Manager V2 / upload / DB.
 */

export { Viewer as OPAL3DViewer } from "./Viewer";
export { Viewer } from "./Viewer";
export { Thumbnail, captureScreenshot, captureSceneThumbnail } from "./Thumbnail";
export { DENTAL_PRESETS } from "./Presets";
export { MATERIAL_LIBRARY } from "./MaterialLibrary";
export { runDentalPipeline, repairDentalMesh } from "./DentalPipeline";
export type {
  OPAL3DViewerProps,
  SceneAsset,
  SceneLayerId,
  SceneLayerState,
  SceneTreeNode,
  SceneWarning,
  TransformMeta,
  DentalPresetId,
  DentalViewMode,
  MaterialProfileId,
  ModelFormat,
  ViewerTheme,
  ViewerProjection,
  ViewerRenderMode,
  ViewerBackground,
  ViewerCameraPreset,
} from "./types";

export const OPAL_VIEWER_V3_READY = true;
export const OPAL_VIEWER_V4_READY = true;
export const OPAL_VIEWER_V5_READY = true;
