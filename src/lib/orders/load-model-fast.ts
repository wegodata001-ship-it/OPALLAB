import {
  getCachedGeometry,
  setGeometryInIdb,
  type CachedGeometry,
} from "@/lib/orders/geometry-cache";
import type { ModelPerfTimings, OrderFileModelMeta } from "@/lib/orders/model-meta";
import { parseModelGeometry } from "@/lib/orders/parse-model-worker";

export type FastModelAccess = {
  fileId: string;
  fileName: string;
  fileSize: number;
  signedUrl: string;
  thumbnailUrl: string | null;
  modelMeta: OrderFileModelMeta | null;
  apiMs: number;
};

export type FastModelLoadResult = {
  geometry: CachedGeometry;
  timings: ModelPerfTimings;
  access: FastModelAccess;
};

export async function fetchModelAccess(fileId: string): Promise<FastModelAccess> {
  const t0 = performance.now();
  const res = await fetch(`/api/orders/files/${fileId}/access`, {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: {
      fileId: string;
      fileName: string;
      fileSize: number;
      signedUrl: string;
      thumbnailUrl?: string | null;
      modelMeta?: OrderFileModelMeta | null;
      timings?: { apiMs?: number };
    };
    error?: { message?: string };
  };
  if (!json.success || !json.data?.signedUrl) {
    throw new Error(json.error?.message || "גישה לקובץ נכשלה");
  }
  return {
    fileId: json.data.fileId,
    fileName: json.data.fileName,
    fileSize: json.data.fileSize,
    signedUrl: json.data.signedUrl,
    thumbnailUrl: json.data.thumbnailUrl ?? null,
    modelMeta: json.data.modelMeta ?? null,
    apiMs: json.data.timings?.apiMs ?? Math.round(performance.now() - t0),
  };
}

/**
 * Fast open path:
 * 1) memory/IDB geometry cache
 * 2) else Signed URL stream + Worker parse (once) → cache
 */
export async function loadModelFast(input: {
  fileId: string;
  fileName?: string;
  fileSize?: number;
  /** Local draft file (create-order) — skip network. */
  localFile?: File | null;
}): Promise<FastModelLoadResult> {
  const totalStart = performance.now();

  if (input.localFile) {
    const tParse = performance.now();
    const buffer = await input.localFile.arrayBuffer();
    const parsed = await parseModelGeometry(input.localFile.name, buffer, {
      forceWorker: buffer.byteLength >= 2 * 1024 * 1024,
    });
    const geometry: CachedGeometry = {
      fileId: input.fileId || `local:${input.localFile.name}`,
      fileSize: input.localFile.size,
      positions: parsed.positions,
      normals: parsed.normals,
      colors: parsed.colors,
      indices: parsed.indices,
      meta: parsed.meta,
      cachedAt: Date.now(),
    };
    await setGeometryInIdb(geometry);
    const parseMs = Math.round(performance.now() - tParse);
    const totalMs = Math.round(performance.now() - totalStart);
    return {
      geometry,
      access: {
        fileId: geometry.fileId,
        fileName: input.localFile.name,
        fileSize: input.localFile.size,
        signedUrl: "",
        thumbnailUrl: null,
        modelMeta: parsed.meta,
        apiMs: 0,
      },
      timings: {
        apiMs: 0,
        storageMs: 0,
        parseMs,
        renderMs: 0,
        totalMs,
        cacheHit: false,
        source: "upload",
      },
    };
  }

  const fileSizeHint = input.fileSize ?? 0;
  if (input.fileId && fileSizeHint > 0) {
    const cached = await getCachedGeometry(input.fileId, fileSizeHint);
    if (cached) {
      // Cache hit — skip network entirely (target reopen < 150ms)
      const totalMs = Math.round(performance.now() - totalStart);
      return {
        geometry: cached.entry,
        access: {
          fileId: input.fileId,
          fileName: input.fileName || cached.entry.meta.ext,
          fileSize: fileSizeHint,
          signedUrl: "",
          thumbnailUrl: null,
          modelMeta: cached.entry.meta,
          apiMs: 0,
        },
        timings: {
          apiMs: 0,
          storageMs: 0,
          parseMs: 0,
          renderMs: 0,
          totalMs,
          cacheHit: true,
          source: cached.source,
        },
      };
    }
  }

  const access = await fetchModelAccess(input.fileId);
  // Re-check cache with authoritative size
  const cached2 = await getCachedGeometry(access.fileId, access.fileSize);
  if (cached2) {
    const totalMs = Math.round(performance.now() - totalStart);
    return {
      geometry: cached2.entry,
      access,
      timings: {
        apiMs: access.apiMs,
        storageMs: 0,
        parseMs: 0,
        renderMs: 0,
        totalMs,
        cacheHit: true,
        source: cached2.source,
      },
    };
  }

  const { streamToArrayBuffer } = await import("@/lib/orders/stream-download");
  const streamed = await streamToArrayBuffer(access.signedUrl);
  const buffer = streamed.buffer;
  const storageMs = streamed.downloadMs;

  const tParse = performance.now();
  const ext = access.fileName.split(".").pop()?.toLowerCase() ?? "";
  let parsed: Awaited<ReturnType<typeof parseModelGeometry>>;
  if (ext === "zip") {
    // ZIP: resolve inner mesh on main (fflate) then geometry extract
    const { bundleFromFile } = await import("@/lib/orders/load-model3d");
    const file = new File([buffer], access.fileName, { type: "application/zip" });
    const bundle = await bundleFromFile(file);
    if (!bundle) throw new Error("ה־ZIP אינו מכיל STL / PLY / OBJ");
    parsed = await parseModelGeometry(bundle.fileName, bundle.buffer, {
      forceWorker: bundle.buffer.byteLength >= 2 * 1024 * 1024,
    });
  } else {
    parsed = await parseModelGeometry(access.fileName, buffer, {
      forceWorker: buffer.byteLength >= 2 * 1024 * 1024,
    });
  }
  const parseMs = Math.round(performance.now() - tParse);

  const geometry: CachedGeometry = {
    fileId: access.fileId,
    fileSize: access.fileSize || buffer.byteLength,
    positions: parsed.positions,
    normals: parsed.normals,
    colors: parsed.colors,
    indices: parsed.indices,
    meta: access.modelMeta ?? parsed.meta,
    cachedAt: Date.now(),
  };
  await setGeometryInIdb(geometry);

  const totalMs = Math.round(performance.now() - totalStart);
  return {
    geometry,
    access: { ...access, modelMeta: geometry.meta },
    timings: {
      apiMs: access.apiMs,
      storageMs,
      firstByteMs: streamed.firstByteMs,
      streamMs: streamed.downloadMs,
      parseMs,
      renderMs: 0,
      totalMs,
      cacheHit: false,
      source: "network",
      format: geometry.meta.ext,
    },
  };
}

/** Prefetch scan files when entering an order (warm IDB + HTTP cache). */
export async function prefetchOrderModels(
  files: Array<{ id: string; fileName: string; fileSize?: number | null; fileType?: string }>,
): Promise<void> {
  const scans = files.filter((f) => {
    const ext = f.fileName.split(".").pop()?.toLowerCase() ?? "";
    return ["stl", "ply", "obj", "glb", "gltf"].includes(ext);
  });

  // Limit concurrency
  const queue = scans.slice(0, 6);
  await Promise.allSettled(
    queue.map(async (f) => {
      try {
        await loadModelFast({
          fileId: f.id,
          fileName: f.fileName,
          fileSize: f.fileSize ?? undefined,
        });
      } catch {
        /* prefetch best-effort */
      }
    }),
  );
}
