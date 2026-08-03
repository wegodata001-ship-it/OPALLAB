"use client";

/**
 * OPAL 3D Viewer V3 — Dental Scene Viewer (Exocad-style)
 * Babylon.js engine. Primary display for OBJ / STL / PLY / GLB / GLTF.
 */

export { Viewer as OPAL3DViewer } from "./Viewer";
export { Viewer } from "./Viewer";
export { Thumbnail, captureScreenshot, captureSceneThumbnail } from "./Thumbnail";
export type {
  OPAL3DViewerProps,
  SceneAsset,
  SceneLayerId,
  SceneLayerState,
  ModelFormat,
  ViewerTheme,
  ViewerProjection,
  ViewerRenderMode,
  ViewerCameraPreset,
} from "./types";

/** V3 is the production dental scene viewer. */
export const OPAL_VIEWER_V3_READY = true;
