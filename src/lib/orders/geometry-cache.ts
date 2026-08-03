import type { OrderFileModelMeta } from "@/lib/orders/model-meta";

export type CachedGeometry = {
  fileId: string;
  fileSize: number;
  positions: Float32Array;
  normals?: Float32Array;
  colors?: Float32Array;
  indices?: Uint32Array;
  meta: OrderFileModelMeta;
  cachedAt: number;
};

const memory = new Map<string, CachedGeometry>();
const DB_NAME = "opal-model-geometry-v1";
const STORE = "geometries";

function cacheKey(fileId: string, fileSize: number): string {
  return `${fileId}:${fileSize}`;
}

export function getGeometryFromMemory(fileId: string, fileSize: number): CachedGeometry | null {
  return memory.get(cacheKey(fileId, fileSize)) ?? null;
}

export function setGeometryInMemory(entry: CachedGeometry): void {
  memory.set(cacheKey(entry.fileId, entry.fileSize), entry);
  // Cap memory cache
  if (memory.size > 24) {
    const oldest = [...memory.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt)[0];
    if (oldest) memory.delete(oldest[0]);
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
  });
}

type IdbRow = {
  key: string;
  fileId: string;
  fileSize: number;
  positions: ArrayBuffer;
  normals?: ArrayBuffer;
  colors?: ArrayBuffer;
  indices?: ArrayBuffer;
  meta: OrderFileModelMeta;
  cachedAt: number;
};

export async function getGeometryFromIdb(
  fileId: string,
  fileSize: number,
): Promise<CachedGeometry | null> {
  try {
    const db = await openDb();
    const row = await new Promise<IdbRow | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(cacheKey(fileId, fileSize));
      req.onsuccess = () => resolve(req.result as IdbRow | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!row) return null;
    const entry: CachedGeometry = {
      fileId: row.fileId,
      fileSize: row.fileSize,
      positions: new Float32Array(row.positions),
      normals: row.normals ? new Float32Array(row.normals) : undefined,
      colors: row.colors ? new Float32Array(row.colors) : undefined,
      indices: row.indices ? new Uint32Array(row.indices) : undefined,
      meta: row.meta,
      cachedAt: row.cachedAt,
    };
    setGeometryInMemory(entry);
    return entry;
  } catch {
    return null;
  }
}

export async function setGeometryInIdb(entry: CachedGeometry): Promise<void> {
  setGeometryInMemory(entry);
  try {
    const db = await openDb();
    const row: IdbRow = {
      key: cacheKey(entry.fileId, entry.fileSize),
      fileId: entry.fileId,
      fileSize: entry.fileSize,
      positions: entry.positions.buffer.slice(
        entry.positions.byteOffset,
        entry.positions.byteOffset + entry.positions.byteLength,
      ) as ArrayBuffer,
      normals: entry.normals
        ? (entry.normals.buffer.slice(
            entry.normals.byteOffset,
            entry.normals.byteOffset + entry.normals.byteLength,
          ) as ArrayBuffer)
        : undefined,
      colors: entry.colors
        ? (entry.colors.buffer.slice(
            entry.colors.byteOffset,
            entry.colors.byteOffset + entry.colors.byteLength,
          ) as ArrayBuffer)
        : undefined,
      indices: entry.indices
        ? (entry.indices.buffer.slice(
            entry.indices.byteOffset,
            entry.indices.byteOffset + entry.indices.byteLength,
          ) as ArrayBuffer)
        : undefined,
      meta: entry.meta,
      cachedAt: entry.cachedAt,
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(row);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* memory cache still holds it */
  }
}

export async function getCachedGeometry(
  fileId: string,
  fileSize: number,
): Promise<{ entry: CachedGeometry; source: "memory" | "idb" } | null> {
  const mem = getGeometryFromMemory(fileId, fileSize);
  if (mem) return { entry: mem, source: "memory" };
  const idb = await getGeometryFromIdb(fileId, fileSize);
  if (idb) return { entry: idb, source: "idb" };
  return null;
}
