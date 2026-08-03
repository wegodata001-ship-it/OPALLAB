import type { OrderFileModelMeta } from "@/lib/orders/model-meta";
import type { WorkerParseResponse } from "@/lib/orders/model-geometry.worker";

export type ParsedModelGeometry = {
  positions: Float32Array;
  normals?: Float32Array;
  colors?: Float32Array;
  indices?: Uint32Array;
  meta: OrderFileModelMeta;
};

const WORKER_THRESHOLD_BYTES = 2 * 1024 * 1024;

let worker: Worker | null = null;
let workerFailed = false;

function getWorker(): Worker | null {
  if (workerFailed || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./model-geometry.worker.ts", import.meta.url), {
      type: "module",
    });
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

async function parseOnMainThread(
  fileName: string,
  buffer: ArrayBuffer,
): Promise<ParsedModelGeometry> {
  const { createThreeObjectFromBundle, bundleFromFile } = await import(
    "@/lib/orders/load-model3d"
  );
  const THREE = await import("three");
  const file = new File([buffer], fileName);
  const bundle = await bundleFromFile(file);
  if (!bundle) throw new Error("פורמט לא נתמך");
  const started = performance.now();
  const object = await createThreeObjectFromBundle(THREE, bundle);

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  let hasColor = false;

  object.traverse(
    (child: {
      isMesh?: boolean;
      geometry?: {
        attributes?: {
          position?: { array: ArrayLike<number> };
          normal?: { array: ArrayLike<number> };
          color?: { array: ArrayLike<number> };
        };
        index?: { array: ArrayLike<number> } | null;
        computeVertexNormals?: () => void;
      };
    }) => {
      if (!child.isMesh || !child.geometry?.attributes?.position) return;
      const g = child.geometry;
      if (!g.attributes!.normal) g.computeVertexNormals?.();
      const p = g.attributes!.position!.array;
      for (let i = 0; i < p.length; i++) positions.push(p[i]!);
      const n = g.attributes!.normal?.array;
      if (n) for (let i = 0; i < n.length; i++) normals.push(n[i]!);
      const c = g.attributes!.color?.array;
      if (c) {
        hasColor = true;
        for (let i = 0; i < c.length; i++) colors.push(c[i]!);
      }
    },
  );

  const pos = new Float32Array(positions);
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
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  const center: [number, number, number] = [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2,
  ];
  const maxDim = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);

  return {
    positions: pos,
    normals: normals.length === positions.length ? new Float32Array(normals) : undefined,
    colors: hasColor ? new Float32Array(colors) : undefined,
    meta: {
      ext: bundle.ext,
      vertexCount: Math.floor(pos.length / 3),
      triangleCount: Math.floor(pos.length / 9),
      bbox: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
      center,
      maxDim,
      hasVertexColors: hasColor,
      hasNormals: normals.length === positions.length,
      parseMs: Math.round(performance.now() - started),
    },
  };
}

function parseInWorker(fileName: string, buffer: ArrayBuffer): Promise<ParsedModelGeometry> {
  const w = getWorker();
  if (!w) return parseOnMainThread(fileName, buffer);

  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<WorkerParseResponse>) => {
      const data = event.data;
      if (!data || data.requestId !== requestId) return;
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      if (data.type === "error") {
        reject(new Error(data.message));
        return;
      }
      resolve({
        positions: data.positions,
        normals: data.normals,
        colors: data.colors,
        indices: data.indices,
        meta: data.meta,
      });
    };
    const onError = () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      workerFailed = true;
      void parseOnMainThread(fileName, buffer).then(resolve, reject);
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    // Copy buffer — caller may still need original
    const copy = buffer.slice(0);
    w.postMessage({ type: "parse", requestId, fileName, buffer: copy }, [copy]);
  });
}

/** Prefer Web Worker for large meshes so the UI stays responsive. */
export async function parseModelGeometry(
  fileName: string,
  buffer: ArrayBuffer,
  opts?: { forceWorker?: boolean },
): Promise<ParsedModelGeometry> {
  const useWorker = opts?.forceWorker || buffer.byteLength >= WORKER_THRESHOLD_BYTES;
  if (useWorker) return parseInWorker(fileName, buffer);
  return parseOnMainThread(fileName, buffer);
}
