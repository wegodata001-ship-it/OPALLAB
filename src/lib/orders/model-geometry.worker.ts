/// <reference lib="webworker" />

/**
 * Parses STL / PLY / OBJ off the main thread.
 * Returns transferable typed arrays + metadata for camera (no Box3 on UI thread).
 */

export type WorkerParseRequest = {
  type: "parse";
  requestId: string;
  fileName: string;
  buffer: ArrayBuffer;
};

export type WorkerParseResponse =
  | {
      type: "ok";
      requestId: string;
      positions: Float32Array;
      normals?: Float32Array;
      colors?: Float32Array;
      indices?: Uint32Array;
      meta: {
        ext: string;
        vertexCount: number;
        triangleCount: number;
        bbox: { min: [number, number, number]; max: [number, number, number] };
        center: [number, number, number];
        maxDim: number;
        hasVertexColors: boolean;
        hasNormals: boolean;
        parseMs: number;
      };
    }
  | { type: "error"; requestId: string; message: string };

declare const self: DedicatedWorkerGlobalScope;

function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function bboxFromPositions(pos: Float32Array): {
  min: [number, number, number];
  max: [number, number, number];
  center: [number, number, number];
  maxDim: number;
} {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i]!,
      y = pos[i + 1]!,
      z = pos[i + 2]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(minX)) {
    return { min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0], maxDim: 1 };
  }
  const center: [number, number, number] = [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2,
  ];
  const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center,
    maxDim,
  };
}

async function parseBuffer(fileName: string, buffer: ArrayBuffer) {
  const started = performance.now();
  const ext = extOf(fileName);
  const THREE = await import("three");

  let positions: Float32Array;
  let normals: Float32Array | undefined;
  let colors: Float32Array | undefined;
  let indices: Uint32Array | undefined;
  let triangleCount = 0;

  if (ext === "stl") {
    const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
    const geometry = new STLLoader().parse(buffer);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    positions = new Float32Array(geometry.attributes.position.array as ArrayLike<number>);
    normals = new Float32Array(geometry.attributes.normal.array as ArrayLike<number>);
    triangleCount = Math.floor(positions.length / 9);
    geometry.dispose();
  } else if (ext === "ply") {
    const { PLYLoader } = await import("three/examples/jsm/loaders/PLYLoader.js");
    const geometry = new PLYLoader().parse(buffer);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    positions = new Float32Array(geometry.attributes.position.array as ArrayLike<number>);
    if (geometry.attributes.normal) {
      normals = new Float32Array(geometry.attributes.normal.array as ArrayLike<number>);
    }
    if (geometry.attributes.color) {
      colors = new Float32Array(geometry.attributes.color.array as ArrayLike<number>);
    }
    if (geometry.index) {
      indices = new Uint32Array(geometry.index.array as ArrayLike<number>);
      triangleCount = Math.floor(indices.length / 3);
    } else {
      triangleCount = Math.floor(positions.length / 9);
    }
    geometry.dispose();
  } else if (ext === "obj") {
    const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");
    const object = new OBJLoader().parse(new TextDecoder().decode(buffer));
    const merged: number[] = [];
    const mergedN: number[] = [];
    object.traverse((child: { isMesh?: boolean; geometry?: { attributes?: { position?: { array: ArrayLike<number> }; normal?: { array: ArrayLike<number> } }; computeVertexNormals?: () => void } }) => {
      if (!child.isMesh || !child.geometry?.attributes?.position) return;
      const g = child.geometry;
      if (!g.attributes!.normal) g.computeVertexNormals?.();
      const p = g.attributes!.position!.array;
      const n = g.attributes!.normal?.array;
      for (let i = 0; i < p.length; i++) merged.push(p[i]!);
      if (n) for (let i = 0; i < n.length; i++) mergedN.push(n[i]!);
    });
    positions = new Float32Array(merged);
    if (mergedN.length === merged.length) normals = new Float32Array(mergedN);
    triangleCount = Math.floor(positions.length / 9);
  } else if (ext === "glb" || ext === "gltf") {
    const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
    const gltf = await new Promise<{ scene: { traverse: (fn: (c: unknown) => void) => void } }>(
      (resolve, reject) => {
        new GLTFLoader().parse(buffer, "", resolve, reject);
      },
    );
    const merged: number[] = [];
    const mergedN: number[] = [];
    const mergedC: number[] = [];
    let hasC = false;
    gltf.scene.traverse((child: unknown) => {
      const c = child as {
        isMesh?: boolean;
        geometry?: {
          attributes?: {
            position?: { array: ArrayLike<number> };
            normal?: { array: ArrayLike<number> };
            color?: { array: ArrayLike<number> };
          };
          computeVertexNormals?: () => void;
        };
      };
      if (!c.isMesh || !c.geometry?.attributes?.position) return;
      const g = c.geometry;
      if (!g.attributes!.normal) g.computeVertexNormals?.();
      const p = g.attributes!.position!.array;
      for (let i = 0; i < p.length; i++) merged.push(p[i]!);
      const n = g.attributes!.normal?.array;
      if (n) for (let i = 0; i < n.length; i++) mergedN.push(n[i]!);
      const col = g.attributes!.color?.array;
      if (col) {
        hasC = true;
        for (let i = 0; i < col.length; i++) mergedC.push(col[i]!);
      }
    });
    positions = new Float32Array(merged);
    if (mergedN.length === merged.length) normals = new Float32Array(mergedN);
    if (hasC) colors = new Float32Array(mergedC);
    triangleCount = Math.floor(positions.length / 9);
  } else {
    throw new Error(`פורמט .${ext} אינו נתמך ב־Worker`);
  }

  void THREE;
  const box = bboxFromPositions(positions);
  const parseMs = Math.round(performance.now() - started);

  return {
    positions,
    normals,
    colors,
    indices,
    meta: {
      ext,
      vertexCount: Math.floor(positions.length / 3),
      triangleCount,
      bbox: { min: box.min, max: box.max },
      center: box.center,
      maxDim: box.maxDim,
      hasVertexColors: Boolean(colors?.length),
      hasNormals: Boolean(normals?.length),
      parseMs,
    },
  };
}

self.onmessage = async (event: MessageEvent<WorkerParseRequest>) => {
  const msg = event.data;
  if (!msg || msg.type !== "parse") return;
  try {
    const result = await parseBuffer(msg.fileName, msg.buffer);
    const transfer: Transferable[] = [result.positions.buffer];
    if (result.normals) transfer.push(result.normals.buffer);
    if (result.colors) transfer.push(result.colors.buffer);
    if (result.indices) transfer.push(result.indices.buffer);

    const response: WorkerParseResponse = {
      type: "ok",
      requestId: msg.requestId,
      positions: result.positions,
      normals: result.normals,
      colors: result.colors,
      indices: result.indices,
      meta: result.meta,
    };
    self.postMessage(response, transfer);
  } catch (err) {
    const response: WorkerParseResponse = {
      type: "error",
      requestId: msg.requestId,
      message: err instanceof Error ? err.message : "Parse failed",
    };
    self.postMessage(response);
  }
};
