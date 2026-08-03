/**
 * In-memory cache for material-preserving 3D scenes (OBJ+MTL+textures / GLB).
 * Geometry-only meshes still use geometry-cache (Memory + IndexedDB).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = any;

export type CachedSceneObject = {
  fileId: string;
  fileSize: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  object: AnyObj;
  textureCount: number;
  triangleCount: number;
  vertexCount: number;
  ext: string;
  cachedAt: number;
};

const memory = new Map<string, CachedSceneObject>();

function cacheKey(fileId: string, fileSize: number): string {
  return `${fileId}:${fileSize}`;
}

export function getSceneObjectFromMemory(
  fileId: string,
  fileSize: number,
): CachedSceneObject | null {
  return memory.get(cacheKey(fileId, fileSize)) ?? null;
}

export function setSceneObjectInMemory(entry: CachedSceneObject): void {
  memory.set(cacheKey(entry.fileId, entry.fileSize), entry);
  if (memory.size > 12) {
    const oldest = [...memory.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt)[0];
    if (oldest) memory.delete(oldest[0]);
  }
}

/** Deep-clone a cached Object3D for a new viewer instance. */
export function cloneCachedSceneObject(entry: CachedSceneObject): AnyObj {
  return entry.object.clone(true);
}
