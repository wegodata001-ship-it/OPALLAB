import {
  Mesh,
  SceneLoader,
  TransformNode,
  VertexBuffer,
  VertexData,
  type AbstractMesh,
  type Scene,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import "@babylonjs/loaders/OBJ";
import { unzipSync } from "fflate";
import type { ModelFormat, SceneAsset, SceneLayerId } from "./types";
import { createMaterialForMesh } from "./Materials";
import { detectFormat, getExt, inferSceneLayer } from "./Utils";

export type LoadedSceneMesh = {
  mesh: AbstractMesh;
  assetId: string;
  fileName: string;
  format: ModelFormat;
  layer: SceneLayerId;
  vertexCount: number;
};

export type LoadSceneProgress = (phase: string, progress: number) => void;

async function resolveBuffer(asset: SceneAsset): Promise<{ buffer: ArrayBuffer; fileName: string }> {
  if (asset.file) {
    return { buffer: await asset.file.arrayBuffer(), fileName: asset.fileName || asset.file.name };
  }
  if (asset.fileId) {
    const res = await fetch(`/api/orders/files/${asset.fileId}/access`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { signedUrl?: string; fileName?: string };
      error?: { message?: string };
    };
    if (!json.success || !json.data?.signedUrl) {
      throw new Error(json.error?.message || `גישה לקובץ נכשלה: ${asset.fileName}`);
    }
    const bin = await fetch(json.data.signedUrl);
    if (!bin.ok) throw new Error(`הורדת קובץ נכשלה: ${asset.fileName}`);
    return {
      buffer: await bin.arrayBuffer(),
      fileName: json.data.fileName || asset.fileName,
    };
  }
  if (asset.url) {
    const bin = await fetch(asset.url, { credentials: "include", cache: "no-store" });
    if (!bin.ok) throw new Error(`הורדת קובץ נכשלה: ${asset.fileName}`);
    return { buffer: await bin.arrayBuffer(), fileName: asset.fileName };
  }
  throw new Error(`אין מקור לקובץ: ${asset.fileName}`);
}

function autoRepairMesh(mesh: Mesh): void {
  try {
    mesh.forceSharedVertices();
  } catch {
    /* ignore */
  }
  try {
    if (!mesh.isVerticesDataPresent(VertexBuffer.NormalKind)) {
      mesh.createNormals(true);
    }
  } catch {
    try {
      mesh.createNormals(false);
    } catch {
      /* ignore */
    }
  }
  try {
    mesh.optimizeIndices();
  } catch {
    /* ignore */
  }
  mesh.computeWorldMatrix(true);
  mesh.refreshBoundingInfo(true, true);
  mesh.freezeWorldMatrix();
  mesh.doNotSyncBoundingInfo = true;
  if (mesh.material) {
    try {
      mesh.material.freeze();
    } catch {
      /* ignore */
    }
  }
}

function parseStl(buffer: ArrayBuffer, name: string, scene: Scene): Mesh {
  const data = new DataView(buffer);
  // Prefer binary size check — many binary STL headers also start with "solid"
  if (buffer.byteLength >= 84) {
    const triCount = data.getUint32(80, true);
    const expected = 84 + triCount * 50;
    if (triCount > 0 && expected === buffer.byteLength) {
      return parseBinaryStl(data, name, scene);
    }
  }
  const head = new TextDecoder().decode(buffer.slice(0, Math.min(64, buffer.byteLength))).toLowerCase();
  if (head.startsWith("solid") && head.includes("facet")) {
    return parseAsciiStl(new TextDecoder().decode(buffer), name, scene);
  }
  if (buffer.byteLength >= 84) {
    return parseBinaryStl(data, name, scene);
  }
  throw new Error("Invalid STL");
}

function parseBinaryStl(data: DataView, name: string, scene: Scene): Mesh {
  const triCount = data.getUint32(80, true);
  const positions: number[] = [];
  const normals: number[] = [];
  let offset = 84;
  for (let i = 0; i < triCount; i++) {
    const nx = data.getFloat32(offset, true);
    const ny = data.getFloat32(offset + 4, true);
    const nz = data.getFloat32(offset + 8, true);
    offset += 12;
    for (let v = 0; v < 3; v++) {
      positions.push(
        data.getFloat32(offset, true),
        data.getFloat32(offset + 4, true),
        data.getFloat32(offset + 8, true),
      );
      normals.push(nx, ny, nz);
      offset += 12;
    }
    offset += 2;
  }
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  const indices = new Array(positions.length / 3);
  for (let i = 0; i < indices.length; i++) indices[i] = i;
  vd.indices = indices;
  vd.applyToMesh(mesh, true);
  return mesh;
}

function parseAsciiStl(text: string, name: string, scene: Scene): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const facetRe = /facet\s+normal\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)([\s\S]*?)endfacet/gi;
  const vertexRe = /vertex\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = facetRe.exec(text))) {
    const nx = parseFloat(m[1]);
    const ny = parseFloat(m[2]);
    const nz = parseFloat(m[3]);
    const body = m[4];
    let vm: RegExpExecArray | null;
    vertexRe.lastIndex = 0;
    while ((vm = vertexRe.exec(body))) {
      positions.push(parseFloat(vm[1]), parseFloat(vm[2]), parseFloat(vm[3]));
      normals.push(nx, ny, nz);
    }
  }
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.normals = normals;
  const indices = new Array(positions.length / 3);
  for (let i = 0; i < indices.length; i++) indices[i] = i;
  vd.indices = indices;
  vd.applyToMesh(mesh, true);
  return mesh;
}

function parsePly(buffer: ArrayBuffer, name: string, scene: Scene): Mesh {
  const textHead = new TextDecoder().decode(buffer.slice(0, Math.min(buffer.byteLength, 8192)));
  if (!textHead.startsWith("ply")) throw new Error("Invalid PLY");
  const headerEnd = textHead.indexOf("end_header");
  if (headerEnd < 0) throw new Error("PLY missing end_header");
  const header = textHead.slice(0, headerEnd);
  const headerBytes = new TextEncoder().encode(textHead.slice(0, headerEnd) + "end_header\n").length;
  // More reliable: find end_header in bytes
  const bytes = new Uint8Array(buffer);
  const marker = new TextEncoder().encode("end_header");
  let hdrEnd = -1;
  for (let i = 0; i < Math.min(bytes.length - marker.length, 65536); i++) {
    let ok = true;
    for (let j = 0; j < marker.length; j++) {
      if (bytes[i + j] !== marker[j]) {
        ok = false;
        break;
      }
    }
    if (ok) {
      let k = i + marker.length;
      while (k < bytes.length && (bytes[k] === 10 || bytes[k] === 13)) k++;
      hdrEnd = k;
      break;
    }
  }
  if (hdrEnd < 0) throw new Error("PLY header end not found");

  const vertexMatch = /element\s+vertex\s+(\d+)/i.exec(header);
  const faceMatch = /element\s+face\s+(\d+)/i.exec(header);
  const vertexCount = vertexMatch ? parseInt(vertexMatch[1], 10) : 0;
  const faceCount = faceMatch ? parseInt(faceMatch[1], 10) : 0;
  const formatMatch = /format\s+(\w+)/i.exec(header);
  const isBinary = !!formatMatch && formatMatch[1].toLowerCase().includes("binary");
  const isLittle = !formatMatch || !formatMatch[1].toLowerCase().includes("big");

  const props: string[] = [];
  for (const line of header.split(/\r?\n/)) {
    const pm = /^property\s+\w+\s+(\w+)/i.exec(line.trim());
    if (pm && !line.includes("list")) props.push(pm[1].toLowerCase());
    if (/^element\s+face/i.test(line)) break;
  }

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const hasColor = props.includes("red") || props.includes("r");

  if (!isBinary) {
    const body = new TextDecoder().decode(buffer.slice(hdrEnd));
    const lines = body.split(/\r?\n/).filter((l) => l.trim().length);
    let li = 0;
    for (let v = 0; v < vertexCount; v++, li++) {
      const parts = lines[li]?.trim().split(/\s+/) ?? [];
      const map: Record<string, number> = {};
      props.forEach((p, idx) => {
        map[p] = parseFloat(parts[idx] ?? "0");
      });
      positions.push(map.x ?? 0, map.y ?? 0, map.z ?? 0);
      if (hasColor) {
        const r = (map.red ?? map.r ?? 255) / 255;
        const g = (map.green ?? map.g ?? 255) / 255;
        const b = (map.blue ?? map.b ?? 255) / 255;
        colors.push(r, g, b, 1);
      }
    }
    for (let f = 0; f < faceCount; f++, li++) {
      const parts = lines[li]?.trim().split(/\s+/).map(Number) ?? [];
      const n = parts[0] ?? 0;
      if (n >= 3) {
        const a = parts[1];
        for (let i = 1; i < n - 1; i++) {
          indices.push(a, parts[i + 1], parts[i + 2]);
        }
      }
    }
  } else {
    const view = new DataView(buffer, hdrEnd);
    let o = 0;
    const readF = () => {
      const v = view.getFloat32(o, isLittle);
      o += 4;
      return v;
    };
    const readU8 = () => {
      const v = view.getUint8(o);
      o += 1;
      return v;
    };
    for (let v = 0; v < vertexCount; v++) {
      let x = 0,
        y = 0,
        z = 0,
        r = 255,
        g = 255,
        b = 255;
      for (const p of props) {
        if (p === "x") x = readF();
        else if (p === "y") y = readF();
        else if (p === "z") z = readF();
        else if (p === "nx" || p === "ny" || p === "nz") readF();
        else if (p === "red" || p === "r") r = readU8();
        else if (p === "green" || p === "g") g = readU8();
        else if (p === "blue" || p === "b") b = readU8();
        else if (p === "alpha" || p === "a") readU8();
        else {
          // skip unknown float-sized
          try {
            readF();
          } catch {
            /* ignore */
          }
        }
      }
      positions.push(x, y, z);
      if (hasColor) colors.push(r / 255, g / 255, b / 255, 1);
    }
    for (let f = 0; f < faceCount; f++) {
      const n = view.getUint8(o);
      o += 1;
      const verts: number[] = [];
      for (let i = 0; i < n; i++) {
        verts.push(view.getUint32(o, isLittle));
        o += 4;
      }
      for (let i = 1; i < verts.length - 1; i++) {
        indices.push(verts[0], verts[i], verts[i + 1]);
      }
    }
  }

  void headerBytes;
  const mesh = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  if (colors.length) vd.colors = colors;
  VertexData.ComputeNormals(positions, indices, (vd.normals = []));
  vd.applyToMesh(mesh, true);
  if (colors.length) mesh.hasVertexAlpha = false;
  return mesh;
}

async function loadViaSceneLoader(
  scene: Scene,
  buffer: ArrayBuffer,
  fileName: string,
  root: TransformNode,
): Promise<AbstractMesh[]> {
  const ext = getExt(fileName);
  const blob = new Blob([buffer]);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const result = await SceneLoader.ImportMeshAsync("", objectUrl, "", scene, undefined, `.${ext}`);
    const meshes = result.meshes.filter((m) => m.name !== "__root__");
    for (const m of meshes) {
      m.parent = root;
    }
    return meshes.length ? meshes : result.meshes;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadZipMeshes(
  scene: Scene,
  buffer: ArrayBuffer,
  root: TransformNode,
  asset: SceneAsset,
): Promise<LoadedSceneMesh[]> {
  const files = unzipSync(new Uint8Array(buffer));
  const names = Object.keys(files).filter((n) => {
    if (n.endsWith("/")) return false;
    const e = getExt(n);
    return ["stl", "obj", "ply", "glb", "gltf"].includes(e);
  });
  if (!names.length) throw new Error(`ZIP ללא מודלים: ${asset.fileName}`);

  const out: LoadedSceneMesh[] = [];
  for (const name of names) {
    const data = files[name];
    const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    const nested: SceneAsset = {
      id: `${asset.id}:${name}`,
      fileName: name.split("/").pop() || name,
      fileId: undefined,
    };
    const loaded = await loadSingleAsset(scene, nested, root, ab as ArrayBuffer);
    out.push(...loaded);
  }
  return out;
}

async function loadSingleAsset(
  scene: Scene,
  asset: SceneAsset,
  root: TransformNode,
  preBuffer?: ArrayBuffer,
): Promise<LoadedSceneMesh[]> {
  const { buffer, fileName } = preBuffer
    ? { buffer: preBuffer, fileName: asset.fileName }
    : await resolveBuffer(asset);
  const format = detectFormat(fileName);
  const layer = inferSceneLayer(asset.fileName, asset.slotKey, asset.category);
  const baseName = `${asset.id}_${fileName}`;

  if (format === "zip") {
    return loadZipMeshes(scene, buffer, root, { ...asset, fileName });
  }

  let meshes: AbstractMesh[] = [];

  if (format === "stl") {
    const mesh = parseStl(buffer, baseName, scene);
    mesh.parent = root;
    meshes = [mesh];
  } else if (format === "ply") {
    const mesh = parsePly(buffer, baseName, scene);
    mesh.parent = root;
    meshes = [mesh];
  } else if (format === "obj" || format === "glb" || format === "gltf") {
    meshes = await loadViaSceneLoader(scene, buffer, fileName, root);
  } else {
    throw new Error(`פורמט לא נתמך: ${fileName}`);
  }

  const prepared: LoadedSceneMesh[] = [];
  for (const mesh of meshes) {
    if (!(mesh instanceof Mesh) && mesh.getTotalVertices?.() === 0) continue;
    if (mesh instanceof Mesh) {
      autoRepairMesh(mesh);
      if (format !== "glb" && format !== "gltf") {
        mesh.material = createMaterialForMesh(scene, baseName, format, layer, mesh);
      } else if (!mesh.material) {
        mesh.material = createMaterialForMesh(scene, baseName, format, layer, mesh);
      }
    }
    mesh.isPickable = true;
    mesh.receiveShadows = true;
    mesh.metadata = {
      ...(mesh.metadata ?? {}),
      opalAssetId: asset.id,
      opalFileName: fileName,
      opalFormat: format,
      opalLayer: layer,
    };
    const vCount = mesh.getTotalVertices?.() ?? 0;
    prepared.push({
      mesh,
      assetId: asset.id,
      fileName,
      format,
      layer,
      vertexCount: vCount,
    });
  }
  return prepared;
}

/**
 * Load Order → all mesh files → sort → meshes → repair → return.
 */
export async function loadDentalScene(
  scene: Scene,
  assets: SceneAsset[],
  onProgress?: LoadSceneProgress,
): Promise<LoadedSceneMesh[]> {
  const root = new TransformNode("opalDentalRoot", scene);
  const sorted = assets;
  const all: LoadedSceneMesh[] = [];
  const total = Math.max(sorted.length, 1);

  for (let i = 0; i < sorted.length; i++) {
    const asset = sorted[i];
    onProgress?.(
      `טוען ${asset.fileName} (${i + 1}/${sorted.length})`,
      Math.round(((i + 0.15) / total) * 100),
    );
    try {
      const loaded = await loadSingleAsset(scene, asset, root);
      all.push(...loaded);
    } catch (err) {
      console.warn("[OPAL3DViewer V3] skip asset", asset.fileName, err);
    }
    onProgress?.(
      `נטען ${asset.fileName}`,
      Math.round(((i + 1) / total) * 90),
    );
  }

  if (!all.length) {
    throw new Error("לא נטענו מודלים לתצוגת הסצנה");
  }

  onProgress?.("מרכז סצנה...", 92);
  return all;
}

export function disposeSceneMeshes(items: LoadedSceneMesh[]): void {
  for (const item of items) {
    try {
      item.mesh.dispose(false, true);
    } catch {
      /* ignore */
    }
  }
}
