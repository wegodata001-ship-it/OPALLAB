/**
 * Lightweight client caches for dental scene loading.
 * Geometry buffers + transform sidecars — GPU buffer reuse via Babylon mesh instances when possible.
 */

type CacheEntry = {
  buffer: ArrayBuffer;
  fileName: string;
  cachedAt: number;
};

const geometryCache = new Map<string, CacheEntry>();
const MAX_ENTRIES = 32;

function keyOf(assetId: string, fileSize?: number): string {
  return `${assetId}:${fileSize ?? 0}`;
}

export function getCachedGeometry(assetId: string, fileSize?: number): CacheEntry | null {
  return geometryCache.get(keyOf(assetId, fileSize)) ?? null;
}

export function setCachedGeometry(
  assetId: string,
  fileSize: number | undefined,
  buffer: ArrayBuffer,
  fileName: string,
): void {
  geometryCache.set(keyOf(assetId, fileSize), {
    buffer,
    fileName,
    cachedAt: Date.now(),
  });
  if (geometryCache.size > MAX_ENTRIES) {
    const oldest = [...geometryCache.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt)[0];
    if (oldest) geometryCache.delete(oldest[0]);
  }
}

const transformCache = new Map<string, unknown>();

export function getCachedTransform(assetId: string): unknown {
  return transformCache.get(assetId);
}

export function setCachedTransform(assetId: string, value: unknown): void {
  transformCache.set(assetId, value);
}

export function clearViewerCaches(): void {
  geometryCache.clear();
  transformCache.clear();
}
