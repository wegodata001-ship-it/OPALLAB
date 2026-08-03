"use client";

/**
 * OPAL 3D Viewer V2 (Babylon.js)
 *
 * Built in parallel with the legacy Three.js ModelViewer3D.
 * Do not delete the old viewer until QA Definition of Done passes.
 */

export { Viewer as OPAL3DViewer } from "./Viewer";
export { Viewer } from "./Viewer";
export { Thumbnail, captureScreenshot } from "./Thumbnail";
export type {
  OPAL3DViewerProps,
  OPAL3DViewerSource,
  ModelFormat,
  ViewerTheme,
  ViewerProjection,
  ViewerRenderMode,
  ViewerCameraPreset,
} from "./types";

/** Feature flag — keep false until lab QA completes. */
export const OPAL_VIEWER_V2_READY = false;

/** Enable via ?viewer=v2 on order file preview for parallel testing. */
export function shouldUseViewerV2(searchParams?: URLSearchParams | null): boolean {
  if (OPAL_VIEWER_V2_READY) return true;
  if (!searchParams) return false;
  return searchParams.get("viewer") === "v2";
}
