export type ViewerTheme = "dark" | "light";
export type ViewerProjection = "perspective" | "orthographic";
export type ViewerRenderMode = "shaded" | "wireframe" | "transparent" | "xray";
export type ViewerCameraPreset =
  | "home"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "front"
  | "back"
  | "iso";

export type ModelFormat =
  | "stl"
  | "obj"
  | "ply"
  | "glb"
  | "gltf"
  | "zip"
  | "unknown";

/** Dental scene layer — Exocad-style visibility groups. */
export type SceneLayerId =
  | "upper"
  | "lower"
  | "gingiva"
  | "bite"
  | "stl"
  | "obj"
  | "ply"
  | "scanBodies"
  | "implant"
  | "temporary"
  | "final"
  | "pdf"
  | "radiograph"
  | "other";

export type SceneAsset = {
  id: string;
  fileName: string;
  url?: string;
  file?: File | null;
  fileId?: string;
  fileSize?: number;
  slotKey?: string | null;
  category?: string | null;
  /** Prefer this asset when focusing after load. */
  primary?: boolean;
};

export type SceneLayerState = {
  id: SceneLayerId;
  label: string;
  visible: boolean;
  count: number;
};

export type OPAL3DViewerProps = {
  /** Full dental scene — all meshes for the order/slot set. */
  sceneFiles?: SceneAsset[];
  /** Legacy single-file props (merged into sceneFiles). */
  url?: string;
  fileName?: string;
  file?: File | null;
  fileId?: string;
  fileSize?: number;
  className?: string;
  onError?: (message: string) => void;
  onLoaded?: () => void;
  showToolbar?: boolean;
  showLayers?: boolean;
};

export type LoadProgress = {
  phase: string;
  progress: number;
};
