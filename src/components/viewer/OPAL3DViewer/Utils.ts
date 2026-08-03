import type { ModelFormat, SceneAsset, SceneLayerId } from "./types";

export function getExt(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : "";
}

export function detectFormat(fileName: string): ModelFormat {
  const ext = getExt(fileName);
  if (ext === "stl") return "stl";
  if (ext === "obj") return "obj";
  if (ext === "ply") return "ply";
  if (ext === "glb") return "glb";
  if (ext === "gltf") return "gltf";
  if (ext === "zip") return "zip";
  return "unknown";
}

export function isMeshAssetName(fileName: string): boolean {
  const f = detectFormat(fileName);
  return f === "stl" || f === "obj" || f === "ply" || f === "glb" || f === "gltf" || f === "zip";
}

/** Infer dental layer from slot / filename heuristics. */
export function inferSceneLayer(
  fileName: string,
  slotKey?: string | null,
  category?: string | null,
): SceneLayerId {
  if (slotKey === "UpperScan" || slotKey === "UpperOcclusal") return "upper";
  if (slotKey === "LowerScan" || slotKey === "LowerOcclusal") return "lower";
  if (slotKey === "BiteScan") return "bite";
  if (category === "Radiographs") return "radiograph";

  const n = fileName.toLowerCase().replace(/[\s_-]+/g, "");
  if (n.includes("gingiva") || n.includes("gum") || n.includes("חניכ")) return "gingiva";
  if (n.includes("scanbody") || n.includes("scan_body") || n.includes("scabody")) return "scanBodies";
  if (n.includes("implant") || n.includes("abutment")) return "implant";
  if (n.includes("temp") || n.includes("provisional")) return "temporary";
  if (n.includes("final") || n.includes("crown") || n.includes("bridge") || n.includes("veneer")) {
    return "final";
  }
  if (n.includes("upper") || n.includes("maxilla") || n.includes("עליון")) return "upper";
  if (n.includes("lower") || n.includes("mandible") || n.includes("תחתון")) return "lower";
  if (n.includes("bite") || n.includes("occlusion") || n.includes("סגר")) return "bite";
  if (n.includes("xray") || n.includes("radio") || n.includes("panoram") || n.includes("cbct")) {
    return "radiograph";
  }

  const fmt = detectFormat(fileName);
  if (fmt === "stl") return "stl";
  if (fmt === "obj") return "obj";
  if (fmt === "ply") return "ply";
  return "other";
}

export const LAYER_LABELS: Record<SceneLayerId, string> = {
  upper: "Upper",
  lower: "Lower",
  gingiva: "Gingiva",
  bite: "Bite",
  stl: "STL",
  obj: "OBJ",
  ply: "PLY",
  scanBodies: "Scan Bodies",
  implant: "Implant",
  temporary: "Temporary",
  final: "Final",
  pdf: "PDF",
  radiograph: "Radiograph",
  other: "Other",
};

export const LAYER_ORDER: SceneLayerId[] = [
  "upper",
  "lower",
  "gingiva",
  "bite",
  "scanBodies",
  "implant",
  "temporary",
  "final",
  "stl",
  "obj",
  "ply",
  "pdf",
  "radiograph",
  "other",
];

/** Hex colors (no alpha) for dental defaults. */
export const LAYER_COLORS: Record<SceneLayerId, string> = {
  upper: "#F5F2EB",
  lower: "#F5F2EB",
  gingiva: "#E8A0A8",
  bite: "#D8E6F0",
  stl: "#E8E4DC",
  obj: "#F0EDE6",
  ply: "#F2F0EA",
  scanBodies: "#F5D76E",
  implant: "#C0C5C9",
  temporary: "#5B9BD5",
  final: "#F5E6C8",
  pdf: "#A0A0A0",
  radiograph: "#8A8A8A",
  other: "#D0CEC8",
};

export function sortSceneAssets(assets: SceneAsset[]): SceneAsset[] {
  const rank = (a: SceneAsset) => {
    const layer = inferSceneLayer(a.fileName, a.slotKey, a.category);
    const idx = LAYER_ORDER.indexOf(layer);
    return (idx < 0 ? 99 : idx) * 10 + (a.primary ? -1 : 0);
  };
  return [...assets].sort((a, b) => rank(a) - rank(b));
}

export function mergeSceneAssets(
  props: {
    sceneFiles?: SceneAsset[];
    url?: string;
    fileName?: string;
    file?: File | null;
    fileId?: string;
    fileSize?: number;
  },
): SceneAsset[] {
  const map = new Map<string, SceneAsset>();
  for (const a of props.sceneFiles ?? []) {
    if (!isMeshAssetName(a.fileName) && !a.file) continue;
    map.set(a.id || a.fileId || a.fileName, { ...a });
  }
  if (props.fileName && (props.url || props.file || props.fileId)) {
    const id = props.fileId || props.fileName;
    const existing = map.get(id);
    map.set(id, {
      id,
      fileName: props.fileName,
      url: props.url ?? existing?.url,
      file: props.file ?? existing?.file,
      fileId: props.fileId ?? existing?.fileId,
      fileSize: props.fileSize ?? existing?.fileSize,
      slotKey: existing?.slotKey,
      category: existing?.category,
      primary: true,
    });
  }
  return sortSceneAssets([...map.values()].filter((a) => isMeshAssetName(a.fileName)));
}

export function hexToColor3Components(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function formatBytes(n?: number): string {
  if (!n || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
