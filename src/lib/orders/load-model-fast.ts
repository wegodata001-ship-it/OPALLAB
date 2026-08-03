import {
  getCachedGeometry,
  setGeometryInIdb,
  type CachedGeometry,
} from "@/lib/orders/geometry-cache";
import type { ModelPerfTimings, OrderFileModelMeta } from "@/lib/orders/model-meta";
import { parseModelGeometry } from "@/lib/orders/parse-model-worker";
import {
  createThreeObjectFromBundle,
  needsRichSceneLoad,
  type LoadedModelBundle,
  type ZipVirtualFs,
} from "@/lib/orders/load-model3d";
import {
  cloneCachedSceneObject,
  getSceneObjectFromMemory,
  setSceneObjectInMemory,
} from "@/lib/orders/scene-object-cache";

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
  onProgress?: (pct: number, label?: string) => void;
}): Promise<FastModelLoadResult> {
  const totalStart = performance.now();
  const report = (pct: number, label?: string) => input.onProgress?.(Math.max(0, Math.min(100, pct)), label);

  if (input.localFile) {
    report(5, "קורא קובץ מקומי...");
    const tParse = performance.now();
    const buffer = await input.localFile.arrayBuffer();
    report(40, "מפרסר גאומטריה...");
    const parsed = await parseModelGeometry(input.localFile.name, buffer, {
      forceWorker: buffer.byteLength >= 2 * 1024 * 1024,
    });
    report(90, "שומר במטמון...");
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
    report(100, "מוכן");
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
    report(8, "בודק מטמון...");
    const cached = await getCachedGeometry(input.fileId, fileSizeHint);
    if (cached) {
      // Cache hit — skip network entirely (target reopen < 150ms)
      report(100, "מטמון");
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

  report(12, "מבקש גישה...");
  const access = await fetchModelAccess(input.fileId);
  // Re-check cache with authoritative size
  const cached2 = await getCachedGeometry(access.fileId, access.fileSize);
  if (cached2) {
    report(100, "מטמון");
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

  report(20, "מוריד מהאחסון...");
  const { streamToArrayBuffer } = await import("@/lib/orders/stream-download");
  const streamed = await streamToArrayBuffer(access.signedUrl, {
    onProgress: (loaded, total) => {
      if (total && total > 0) {
        report(20 + Math.round((loaded / total) * 55), "מוריד מהאחסון...");
      }
    },
  });
  const buffer = streamed.buffer;
  const storageMs = streamed.downloadMs;

  report(78, "מפרסר גאומטריה...");
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
  report(95, "שומר במטמון...");

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
  report(100, "מוכן");

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
    return ["stl", "ply", "obj", "glb", "gltf", "zip"].includes(ext);
  });

  // Limit concurrency
  const queue = scans.slice(0, 6);
  await Promise.allSettled(
    queue.map(async (f) => {
      try {
        await loadDentalModel({
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

export type MaterialCompanionSource = {
  fileName: string;
  file?: File | null;
  fileId?: string;
  url?: string;
};

export type DentalModelLoadResult =
  | {
      mode: "geometry";
      geometry: CachedGeometry;
      timings: ModelPerfTimings;
      access: FastModelAccess;
      textureCount: number;
    }
  | {
      mode: "object";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      object: any;
      timings: ModelPerfTimings;
      access: FastModelAccess;
      textureCount: number;
      triangleCount: number;
      vertexCount: number;
    };

function countMeshStats(object: {
  traverse: (fn: (c: {
    isMesh?: boolean;
    geometry?: { getAttribute: (n: string) => { count: number } | undefined; getIndex: () => { count: number } | null };
  }) => void) => void;
}): { triangles: number; vertices: number } {
  let verts = 0;
  let tris = 0;
  object.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    const pos = child.geometry.getAttribute("position");
    if (pos) verts += pos.count;
    const idx = child.geometry.getIndex();
    tris += idx ? idx.count / 3 : (pos?.count ?? 0) / 3;
  });
  return { triangles: Math.round(tris), vertices: Math.round(verts) };
}

async function fetchBytes(source: MaterialCompanionSource): Promise<Uint8Array> {
  if (source.file) {
    return new Uint8Array(await source.file.arrayBuffer());
  }
  if (source.fileId) {
    const access = await fetchModelAccess(source.fileId);
    const res = await fetch(access.signedUrl, { credentials: "omit", redirect: "follow" });
    if (!res.ok) throw new Error(`טעינת ${source.fileName} נכשלה`);
    return new Uint8Array(await res.arrayBuffer());
  }
  if (source.url) {
    const res = await fetch(source.url, { credentials: "include", redirect: "follow" });
    if (!res.ok) throw new Error(`טעינת ${source.fileName} נכשלה`);
    return new Uint8Array(await res.arrayBuffer());
  }
  throw new Error(`חסר מקור ל־${source.fileName}`);
}

async function buildCompanionFs(
  companions: MaterialCompanionSource[],
  report: (pct: number, label?: string) => void,
): Promise<ZipVirtualFs> {
  const fs: ZipVirtualFs = new Map();
  if (!companions.length) return fs;
  for (let i = 0; i < companions.length; i++) {
    const c = companions[i]!;
    report(30 + Math.round((i / companions.length) * 25), `טוען ${c.fileName}...`);
    const bytes = await fetchBytes(c);
    const base = c.fileName.replace(/\\/g, "/").split("/").pop() || c.fileName;
    fs.set(c.fileName.replace(/\\/g, "/"), bytes);
    fs.set(base.toLowerCase(), bytes);
  }
  return fs;
}

/**
 * Unified dental viewer loader:
 * - STL / PLY → transferable geometry cache (Memory + IDB)
 * - OBJ / ZIP / GLB / GLTF → material-preserving Object3D + memory scene cache
 */
export async function loadDentalModel(input: {
  fileId: string;
  fileName?: string;
  fileSize?: number;
  localFile?: File | null;
  /** MTL / textures (or other sidecars) for OBJ. */
  materialCompanions?: MaterialCompanionSource[];
  onProgress?: (pct: number, label?: string) => void;
}): Promise<DentalModelLoadResult> {
  const report = (pct: number, label?: string) =>
    input.onProgress?.(Math.max(0, Math.min(100, pct)), label);
  const name = input.fileName || input.localFile?.name || "model";
  const rich = needsRichSceneLoad(name) || Boolean(input.materialCompanions?.length);

  if (!rich) {
    const fast = await loadModelFast(input);
    return { mode: "geometry", ...fast, textureCount: 0 };
  }

  const totalStart = performance.now();
  const fileSizeHint = input.fileSize ?? input.localFile?.size ?? 0;

  if (input.fileId && fileSizeHint > 0) {
    report(8, "בודק מטמון סצנה...");
    const hit = getSceneObjectFromMemory(input.fileId, fileSizeHint);
    if (hit) {
      report(100, "מטמון");
      const totalMs = Math.round(performance.now() - totalStart);
      return {
        mode: "object",
        object: cloneCachedSceneObject(hit),
        textureCount: hit.textureCount,
        triangleCount: hit.triangleCount,
        vertexCount: hit.vertexCount,
        access: {
          fileId: input.fileId,
          fileName: name,
          fileSize: fileSizeHint,
          signedUrl: "",
          thumbnailUrl: null,
          modelMeta: null,
          apiMs: 0,
        },
        timings: {
          apiMs: 0,
          storageMs: 0,
          parseMs: 0,
          renderMs: 0,
          totalMs,
          cacheHit: true,
          source: "memory",
        },
      };
    }
  }

  report(12, "טוען מודל...");
  let bundle: LoadedModelBundle | null = null;
  let access: FastModelAccess;
  let storageMs = 0;
  let textureLoadMs = 0;

  if (input.localFile) {
    access = {
      fileId: input.fileId || `local:${input.localFile.name}`,
      fileName: input.localFile.name,
      fileSize: input.localFile.size,
      signedUrl: "",
      thumbnailUrl: null,
      modelMeta: null,
      apiMs: 0,
    };
    report(25, "קורא קובץ מקומי...");
    bundle = await (await import("@/lib/orders/load-model3d")).bundleFromFile(input.localFile);
    if (!bundle) {
      // Plain OBJ without zip — wrap manually
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      if (ext === "obj" || ext === "glb" || ext === "gltf") {
        bundle = {
          ext: ext as LoadedModelBundle["ext"],
          fileName: input.localFile.name,
          buffer: await input.localFile.arrayBuffer(),
          companions: new Map(),
        };
      }
    }
  } else {
    report(15, "מבקש גישה...");
    access = await fetchModelAccess(input.fileId);
    const cachedScene = getSceneObjectFromMemory(access.fileId, access.fileSize);
    if (cachedScene) {
      report(100, "מטמון");
      const totalMs = Math.round(performance.now() - totalStart);
      return {
        mode: "object",
        object: cloneCachedSceneObject(cachedScene),
        textureCount: cachedScene.textureCount,
        triangleCount: cachedScene.triangleCount,
        vertexCount: cachedScene.vertexCount,
        access,
        timings: {
          apiMs: access.apiMs,
          storageMs: 0,
          parseMs: 0,
          renderMs: 0,
          totalMs,
          cacheHit: true,
          source: "memory",
        },
      };
    }
    report(22, "מוריד מהאחסון...");
    const { streamToArrayBuffer } = await import("@/lib/orders/stream-download");
    const streamed = await streamToArrayBuffer(access.signedUrl, {
      onProgress: (loaded, total) => {
        if (total && total > 0) {
          report(22 + Math.round((loaded / total) * 40), "מוריד מהאחסון...");
        }
      },
    });
    storageMs = streamed.downloadMs;
    const file = new File([streamed.buffer], access.fileName, {
      type: "application/octet-stream",
    });
    const { bundleFromFile } = await import("@/lib/orders/load-model3d");
    bundle = await bundleFromFile(file);
    if (!bundle) {
      const ext = access.fileName.split(".").pop()?.toLowerCase() ?? "";
      if (ext === "obj" || ext === "glb" || ext === "gltf") {
        bundle = {
          ext: ext as LoadedModelBundle["ext"],
          fileName: access.fileName,
          buffer: streamed.buffer,
          companions: new Map(),
        };
      }
    }
  }

  if (!bundle) throw new Error("לא ניתן לטעון את המודל התלת־ממדי");

  if (input.materialCompanions?.length) {
    const tTex = performance.now();
    const extra = await buildCompanionFs(input.materialCompanions, report);
    for (const [k, v] of extra) bundle.companions.set(k, v);
    textureLoadMs = Math.round(performance.now() - tTex);
  }

  report(70, "בונה חומרים וטקסטורות...");
  const tParse = performance.now();
  const THREE = await import("three");
  const object = await createThreeObjectFromBundle(THREE, bundle);
  const parseMs = Math.round(performance.now() - tParse);
  const stats = countMeshStats(object);
  const textureCount = Number(object.userData?.textureCount ?? 0);

  setSceneObjectInMemory({
    fileId: access.fileId,
    fileSize: access.fileSize || fileSizeHint || 1,
    object: object.clone(true),
    textureCount,
    triangleCount: stats.triangles,
    vertexCount: stats.vertices,
    ext: bundle.ext,
    cachedAt: Date.now(),
  });

  report(100, "מוכן");
  const totalMs = Math.round(performance.now() - totalStart);
  return {
    mode: "object",
    object,
    textureCount,
    triangleCount: stats.triangles,
    vertexCount: stats.vertices,
    access,
    timings: {
      apiMs: access.apiMs,
      storageMs,
      parseMs,
      renderMs: 0,
      totalMs,
      cacheHit: false,
      source: input.localFile ? "upload" : "network",
      format: bundle.ext,
      textureMs: textureLoadMs || undefined,
    },
  };
}
