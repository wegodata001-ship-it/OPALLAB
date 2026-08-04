export type ViewerTheme = "dark" | "light";
export type ViewerProjection = "perspective" | "orthographic";
export type ViewerRenderMode = "shaded" | "wireframe" | "transparent" | "xray";
export type ViewerBackground =
  | "darkGray"
  | "lightGray"
  | "whiteStudio"
  | "gradientGray"
  | "transparent";
/** Premium view modes — Display menu. */
export type DentalViewMode =
  | "dental"
  | "scan"
  | "cad"
  | "xray"
  | "wireframe"
  | "clay"
  | "monochrome";
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

export type DentalPresetId =
  | "clinical"
  | "cad"
  | "scan"
  | "xray"
  | "implant"
  | "dental"
  | "clay"
  | "monochrome"
  | "wireframe";

export type MaterialProfileId =
  | "enamel"
  | "gingiva"
  | "titanium"
  | "zirconia"
  | "pmma"
  | "metal"
  | "wax"
  | "scanBody"
  | "vertexColor"
  | "ivory"
  | "dentalScan"
  | "clay"
  | "monochrome"
  | "default";

/** Manufacturer / scanner / CAD transform — never discard relative poses. */
export type TransformMeta = {
  translation?: [number, number, number];
  /** Euler XYZ in degrees */
  rotation?: [number, number, number];
  rotationQuaternion?: [number, number, number, number];
  scale?: [number, number, number] | number;
  /** 4x4 matrix, 16 numbers (row-major) */
  matrix?: number[];
  scannerMatrix?: number[];
  localOrigin?: [number, number, number];
  source?: "sidecar" | "modelMeta" | "gltf" | "manual" | "inferred";
};

export type RegistrationMode = "manufacturer" | "scene-center" | "manual";

export type SceneAsset = {
  id: string;
  fileName: string;
  url?: string;
  file?: File | null;
  fileId?: string;
  fileSize?: number;
  slotKey?: string | null;
  category?: string | null;
  primary?: boolean;
  /** Optional manufacturer transform */
  transform?: TransformMeta | null;
  /** Parsed upload meta (bbox/center) — not a pose by itself */
  modelMeta?: {
    bbox?: { min: [number, number, number]; max: [number, number, number] };
    center?: [number, number, number];
    maxDim?: number;
    hasVertexColors?: boolean;
    hasNormals?: boolean;
    transform?: TransformMeta | null;
  } | null;
  displayName?: string;
};

export type SceneLayerState = {
  id: SceneLayerId;
  label: string;
  visible: boolean;
  locked: boolean;
  count: number;
};

export type SceneTreeNode = {
  assetId: string;
  meshId: string;
  fileName: string;
  displayName: string;
  layer: SceneLayerId;
  format: ModelFormat;
  visible: boolean;
  locked: boolean;
  vertexCount: number;
  hasTransform: boolean;
};

export type SceneWarning = {
  code:
    | "MISSING_MESH"
    | "INVALID_NORMALS"
    | "HUGE_SCALE"
    | "WRONG_UNITS"
    | "DUPLICATE_MESH"
    | "BROKEN_GEOMETRY"
    | "NO_TRANSFORM";
  message: string;
  assetId?: string;
  fileName?: string;
};

export type OPAL3DViewerProps = {
  sceneFiles?: SceneAsset[];
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
  /** Chrome actions — usually from the host modal. */
  onClose?: () => void;
  onFullscreen?: () => void;
  isFullscreen?: boolean;
  onOpenExternal?: () => void;
  onDownload?: () => void;
};

export type LoadProgress = {
  phase: string;
  progress: number;
  detail?: string;
};
