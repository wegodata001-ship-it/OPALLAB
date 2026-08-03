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

export type ModelFormat = "stl" | "obj" | "ply" | "glb" | "gltf" | "step" | "iges" | "unknown";

export type OPAL3DViewerSource = {
  url?: string;
  file?: File | null;
  fileName: string;
  fileId?: string;
  fileSize?: number;
};

export type OPAL3DViewerProps = {
  url?: string;
  fileName: string;
  file?: File | null;
  fileId?: string;
  fileSize?: number;
  className?: string;
  onError?: (message: string) => void;
  onLoaded?: () => void;
  showToolbar?: boolean;
};

export type LoadProgress = {
  phase: string;
  progress: number;
};
