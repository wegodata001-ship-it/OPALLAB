/** Mesh metadata extracted once at upload — reused for camera / list without re-parse. */

export type ModelBBox = {
  min: [number, number, number];
  max: [number, number, number];
};

export type OrderFileModelMeta = {
  ext: string;
  vertexCount: number;
  triangleCount: number;
  bbox: ModelBBox;
  center: [number, number, number];
  maxDim: number;
  hasVertexColors: boolean;
  hasNormals: boolean;
  /** Parse duration at upload (ms). */
  parseMs?: number;
};

export type ModelPerfTimings = {
  apiMs: number;
  storageMs: number;
  /** Time-to-first-byte from Storage stream */
  firstByteMs?: number;
  streamMs?: number;
  parseMs: number;
  /** Sidecar MTL/texture fetch+decode (OBJ packs). */
  textureMs?: number;
  geometryMs?: number;
  materialMs?: number;
  bboxMs?: number;
  thumbnailMs?: number;
  viewerLoadMs?: number;
  renderMs: number;
  totalMs: number;
  cacheHit: boolean;
  source: "memory" | "idb" | "network" | "upload";
  format?: string;
};

export function isModelMeta(value: unknown): value is OrderFileModelMeta {
  if (!value || typeof value !== "object") return false;
  const v = value as OrderFileModelMeta;
  return (
    typeof v.vertexCount === "number" &&
    typeof v.triangleCount === "number" &&
    Array.isArray(v.center) &&
    v.center.length === 3 &&
    typeof v.maxDim === "number" &&
    v.bbox != null
  );
}

export function metaFromUnknown(value: unknown): OrderFileModelMeta | null {
  return isModelMeta(value) ? value : null;
}

export function computeMaxDim(bbox: ModelBBox): number {
  return Math.max(
    bbox.max[0] - bbox.min[0],
    bbox.max[1] - bbox.min[1],
    bbox.max[2] - bbox.min[2],
    1,
  );
}
