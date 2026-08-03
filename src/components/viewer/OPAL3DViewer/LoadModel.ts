import {
  ImportMeshAsync,
  Mesh,
  MeshBuilder,
  Quaternion,
  TransformNode,
  Vector3,
  VertexBuffer,
  VertexData,
  type AbstractMesh,
  type Scene,
} from "@babylonjs/core";
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic";
import { applyFormatMaterials } from "./Materials";
import {
  applyHardwareScaling,
  createOctreeIfLarge,
  estimateVertexCount,
  freezeLoadedMeshes,
} from "./Performance";
import type { LoadProgress, ModelFormat } from "./types";
import type { Engine } from "@babylonjs/core";

let loadersRegistered = false;

function ensureLoaders(): void {
  if (loadersRegistered) return;
  registerBuiltInLoaders();
  loadersRegistered = true;
}

export function detectFormat(fileName: string): ModelFormat {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "stl") return "stl";
  if (ext === "obj") return "obj";
  if (ext === "ply") return "ply";
  if (ext === "glb") return "glb";
  if (ext === "gltf") return "gltf";
  if (ext === "step" || ext === "stp") return "step";
  if (ext === "iges" || ext === "igs") return "iges";
  return "unknown";
}

async function fetchAsFile(
  url: string,
  fileName: string,
  onProgress?: (p: LoadProgress) => void,
): Promise<File> {
  onProgress?.({ phase: "מוריד קובץ...", progress: 5 });
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error(`הורדת הקובץ נכשלה (${res.status})`);
  const buf = await res.arrayBuffer();
  onProgress?.({ phase: "קובץ התקבל", progress: 25 });
  return new File([buf], fileName, {
    type: res.headers.get("content-type") || "application/octet-stream",
  });
}

/**
 * Minimal ASCII / binary LE PLY loader with vertex colors.
 * Babylon 9 loaders package does not ship a mesh PLY importer.
 */
function loadPlyMesh(scene: Scene, buffer: ArrayBuffer, name: string): AbstractMesh {
  const textHead = new TextDecoder().decode(buffer.slice(0, Math.min(buffer.byteLength, 4096)));
  if (!textHead.startsWith("ply")) throw new Error("קובץ PLY לא תקין");

  const headerEnd = textHead.indexOf("end_header");
  if (headerEnd < 0) throw new Error("חסר end_header ב-PLY");

  const headerText = textHead.slice(0, headerEnd);
  const lines = headerText.split(/\r?\n/);
  const isBinary = /format\s+binary_little_endian/i.test(headerText);
  const isAscii = /format\s+ascii/i.test(headerText);
  if (!isBinary && !isAscii) throw new Error("פורמט PLY לא נתמך (רק ascii / binary_little_endian)");

  let vertexCount = 0;
  let faceCount = 0;
  type Prop = { name: string; type: string };
  const vertexProps: Prop[] = [];
  let section: "none" | "vertex" | "face" = "none";

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("element vertex")) {
      vertexCount = Number(t.split(/\s+/)[2] ?? 0);
      section = "vertex";
    } else if (t.startsWith("element face")) {
      faceCount = Number(t.split(/\s+/)[2] ?? 0);
      section = "face";
    } else if (t.startsWith("element ")) {
      section = "none";
    } else if (t.startsWith("property ") && section === "vertex") {
      const parts = t.split(/\s+/);
      // property uchar red / property float x
      if (parts[1] === "list") continue;
      vertexProps.push({ type: parts[1]!, name: parts[2]! });
    }
  }

  if (vertexCount <= 0) throw new Error("PLY ללא נקודות");

  const positions = new Float32Array(vertexCount * 3);
  let normals: Float32Array | null = null;
  let colors: Float32Array | null = null;
  const hasNx = vertexProps.some((p) => p.name === "nx");
  const hasRed = vertexProps.some((p) => p.name === "red");
  if (hasNx) normals = new Float32Array(vertexCount * 3);
  if (hasRed) colors = new Float32Array(vertexCount * 3);

  const typeSize = (t: string) => {
    if (t === "float" || t === "float32") return 4;
    if (t === "double" || t === "float64") return 8;
    if (t === "uchar" || t === "uint8" || t === "char" || t === "int8") return 1;
    if (t === "ushort" || t === "uint16" || t === "short" || t === "int16") return 2;
    if (t === "int" || t === "int32" || t === "uint" || t === "uint32") return 4;
    return 4;
  };

  const headerBytes =
    new TextEncoder().encode(textHead.slice(0, headerEnd) + "end_header\n").length;
  // More robust: find exact end_header\n in bytes
  const bytes = new Uint8Array(buffer);
  let dataOffset = 0;
  const marker = "end_header";
  const ascii = new TextDecoder().decode(bytes);
  const idx = ascii.indexOf(marker);
  if (idx < 0) throw new Error("חסר end_header ב-PLY");
  let i = idx + marker.length;
  while (i < ascii.length && (ascii[i] === "\r" || ascii[i] === "\n" || ascii[i] === " ")) i++;
  // For binary, find byte offset of first newline after end_header
  const markerBytes = new TextEncoder().encode("end_header");
  outer: for (let b = 0; b < bytes.length - markerBytes.length; b++) {
    let ok = true;
    for (let k = 0; k < markerBytes.length; k++) {
      if (bytes[b + k] !== markerBytes[k]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    let p = b + markerBytes.length;
    if (bytes[p] === 0x0d) p++;
    if (bytes[p] === 0x0a) p++;
    dataOffset = p;
    break outer;
  }
  if (!dataOffset) dataOffset = headerBytes;

  const propIndex = (n: string) => vertexProps.findIndex((p) => p.name === n);

  if (isAscii) {
    const body = new TextDecoder().decode(buffer.slice(dataOffset));
    const bodyLines = body.split(/\r?\n/).filter((l) => l.trim().length);
    for (let v = 0; v < vertexCount; v++) {
      const parts = bodyLines[v]!.trim().split(/\s+/);
      const get = (n: string) => Number(parts[propIndex(n)] ?? 0);
      positions[v * 3] = get("x");
      positions[v * 3 + 1] = get("y");
      positions[v * 3 + 2] = get("z");
      if (normals) {
        normals[v * 3] = get("nx");
        normals[v * 3 + 1] = get("ny");
        normals[v * 3 + 2] = get("nz");
      }
      if (colors) {
        const r = get("red");
        const g = get("green");
        const b = get("blue");
        const scale = r > 1 || g > 1 || b > 1 ? 1 / 255 : 1;
        colors[v * 3] = r * scale;
        colors[v * 3 + 1] = g * scale;
        colors[v * 3 + 2] = b * scale;
      }
    }
    const indices: number[] = [];
    for (let f = 0; f < faceCount; f++) {
      const parts = bodyLines[vertexCount + f]!.trim().split(/\s+/).map(Number);
      const n = parts[0] ?? 0;
      if (n === 3) {
        indices.push(parts[1]!, parts[2]!, parts[3]!);
      } else if (n === 4) {
        indices.push(parts[1]!, parts[2]!, parts[3]!, parts[1]!, parts[3]!, parts[4]!);
      }
    }
    return buildMeshFromArrays(scene, name, positions, normals, colors, indices);
  }

  // Binary little-endian
  const view = new DataView(buffer, dataOffset);
  let offset = 0;
  const readProp = (type: string): number => {
    const t = type.toLowerCase();
    if (t === "float" || t === "float32") {
      const v = view.getFloat32(offset, true);
      offset += 4;
      return v;
    }
    if (t === "double" || t === "float64") {
      const v = view.getFloat64(offset, true);
      offset += 8;
      return v;
    }
    if (t === "uchar" || t === "uint8") {
      const v = view.getUint8(offset);
      offset += 1;
      return v;
    }
    if (t === "char" || t === "int8") {
      const v = view.getInt8(offset);
      offset += 1;
      return v;
    }
    if (t === "ushort" || t === "uint16") {
      const v = view.getUint16(offset, true);
      offset += 2;
      return v;
    }
    if (t === "short" || t === "int16") {
      const v = view.getInt16(offset, true);
      offset += 2;
      return v;
    }
    if (t === "uint" || t === "uint32") {
      const v = view.getUint32(offset, true);
      offset += 4;
      return v;
    }
    if (t === "int" || t === "int32") {
      const v = view.getInt32(offset, true);
      offset += 4;
      return v;
    }
    offset += typeSize(t);
    return 0;
  };

  for (let v = 0; v < vertexCount; v++) {
    const vals: Record<string, number> = {};
    for (const p of vertexProps) vals[p.name] = readProp(p.type);
    positions[v * 3] = vals.x ?? 0;
    positions[v * 3 + 1] = vals.y ?? 0;
    positions[v * 3 + 2] = vals.z ?? 0;
    if (normals) {
      normals[v * 3] = vals.nx ?? 0;
      normals[v * 3 + 1] = vals.ny ?? 0;
      normals[v * 3 + 2] = vals.nz ?? 0;
    }
    if (colors) {
      const r = vals.red ?? 0;
      const g = vals.green ?? 0;
      const b = vals.blue ?? 0;
      const scale = r > 1 || g > 1 || b > 1 ? 1 / 255 : 1;
      colors[v * 3] = r * scale;
      colors[v * 3 + 1] = g * scale;
      colors[v * 3 + 2] = b * scale;
    }
  }

  const indices: number[] = [];
  for (let f = 0; f < faceCount; f++) {
    const n = view.getUint8(offset);
    offset += 1;
    const verts: number[] = [];
    for (let k = 0; k < n; k++) {
      // common: list uchar int vertex_indices
      const idx = view.getInt32(offset, true);
      offset += 4;
      verts.push(idx);
    }
    if (n === 3) indices.push(verts[0]!, verts[1]!, verts[2]!);
    else if (n >= 4) {
      for (let k = 1; k < n - 1; k++) {
        indices.push(verts[0]!, verts[k]!, verts[k + 1]!);
      }
    }
  }

  return buildMeshFromArrays(scene, name, positions, normals, colors, indices);
}

function buildMeshFromArrays(
  scene: Scene,
  name: string,
  positions: Float32Array,
  normals: Float32Array | null,
  colors: Float32Array | null,
  indices: number[],
): AbstractMesh {
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions;
  if (normals) vd.normals = normals;
  if (colors) vd.colors = colorsToRgba(colors);
  if (indices.length) vd.indices = indices;
  else {
    // Point cloud fallback — create tiny triangles is expensive; use MeshBuilder points
    // Convert to unindexed mesh of degenerate? Better: keep as point cloud via Lines? 
    // For dental PLY without faces, still show as mesh with auto indices none — use PointsCloud
  }
  vd.applyToMesh(mesh, true);
  if (!normals) {
    VertexData.ComputeNormals(positions, vd.indices ?? [], (vd.normals = []));
    mesh.setVerticesData(VertexBuffer.NormalKind, vd.normals);
  }
  mesh.isPickable = true;
  return mesh;
}

function colorsToRgba(rgb: Float32Array): Float32Array {
  const out = new Float32Array((rgb.length / 3) * 4);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j += 4) {
    out[j] = rgb[i]!;
    out[j + 1] = rgb[i + 1]!;
    out[j + 2] = rgb[i + 2]!;
    out[j + 3] = 1;
  }
  return out;
}

export type PreparedModel = {
  root: TransformNode;
  meshes: AbstractMesh[];
  format: ModelFormat;
  vertexCount: number;
};

/**
 * Load + prepare model. Canvas stays blank until this resolves
 * (center, scale, normals, materials).
 */
export async function loadAndPrepareModel(opts: {
  scene: Scene;
  engine: Engine;
  fileName: string;
  file?: File | null;
  url?: string;
  onProgress?: (p: LoadProgress) => void;
}): Promise<PreparedModel> {
  ensureLoaders();
  const format = detectFormat(opts.fileName);

  if (format === "step" || format === "iges") {
    throw new Error("STEP/IGES יתמכו בגרסה הבאה של Viewer V2");
  }
  if (format === "unknown") {
    throw new Error(`פורמט לא נתמך: ${opts.fileName}`);
  }

  opts.onProgress?.({ phase: "טוען מודל...", progress: 10 });

  let file = opts.file ?? null;
  if (!file && opts.url) {
    file = await fetchAsFile(opts.url, opts.fileName, opts.onProgress);
  }
  if (!file) throw new Error("אין קובץ לטעינה");

  opts.onProgress?.({ phase: "מפענח גאומטריה...", progress: 35 });

  let meshes: AbstractMesh[] = [];

  if (format === "ply") {
    const buffer = await file.arrayBuffer();
    const mesh = loadPlyMesh(opts.scene, buffer, opts.fileName);
    meshes = [mesh];
  } else {
    const result = await ImportMeshAsync(file, opts.scene, {
      pluginExtension: `.${format}`,
    });
    meshes = result.meshes.filter((m) => m.getTotalVertices() > 0);
    if (!meshes.length) {
      meshes = result.meshes;
    }
  }

  if (!meshes.length) throw new Error("לא נמצאו meshes במודל");

  opts.onProgress?.({ phase: "Bounding Box / Center / Scale...", progress: 70 });

  const root = new TransformNode("opalModelRoot", opts.scene);
  for (const m of meshes) {
    if (!m.parent) {
      m.parent = root;
    }
  }

  // Force world matrix update before bounds
  root.computeWorldMatrix(true);
  for (const m of meshes) {
    m.computeWorldMatrix(true);
    m.refreshBoundingInfo(true, true);
  }

  // Compute combined bounds
  let min = meshes[0]!.getBoundingInfo().boundingBox.minimumWorld.clone();
  let max = meshes[0]!.getBoundingInfo().boundingBox.maximumWorld.clone();
  for (let i = 1; i < meshes.length; i++) {
    const bb = meshes[i]!.getBoundingInfo().boundingBox;
    min = Vector3.Minimize(min, bb.minimumWorld);
    max = Vector3.Maximize(max, bb.maximumWorld);
  }

  const center = min.add(max).scale(0.5);
  const size = max.subtract(min);
  const maxDim = Math.max(size.x, size.y, size.z, 0.0001);

  // Center model at origin
  root.position = root.position.subtract(center);

  // Auto scale to ~2 units (stable camera range)
  const targetSize = 2;
  const scale = targetSize / maxDim;
  root.scaling = new Vector3(scale, scale, scale);

  // Recompute after transform
  root.computeWorldMatrix(true);
  for (const m of meshes) {
    m.computeWorldMatrix(true);
    m.refreshBoundingInfo(true, true);
    // Normals if missing
    if (!m.isVerticesDataPresent(VertexBuffer.NormalKind)) {
      m.createNormals(true);
    }
  }

  opts.onProgress?.({ phase: "חומרים...", progress: 88 });
  applyFormatMaterials(meshes, opts.scene, format);

  const vertexCount = estimateVertexCount(meshes);
  applyHardwareScaling(opts.engine, vertexCount > 1_000_000);
  createOctreeIfLarge(opts.scene, meshes);
  freezeLoadedMeshes(meshes);

  opts.onProgress?.({ phase: "מוכן", progress: 100 });

  return { root, meshes, format, vertexCount };
}

/** Double-click zoom-to helper: temporary highlight box (optional). */
export function createFocusMarker(scene: Scene): Mesh {
  const box = MeshBuilder.CreateBox("focusMarker", { size: 0.05 }, scene);
  box.isVisible = false;
  box.isPickable = false;
  box.rotationQuaternion = Quaternion.Identity();
  return box;
}
