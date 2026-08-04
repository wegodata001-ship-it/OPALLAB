import { Vector3, type AbstractMesh, type TransformNode } from "@babylonjs/core";
import { computeSceneBounds, type SceneBounds } from "./Camera";
import type { LoadedSceneMesh } from "./Loaders";

/**
 * Scene alignment / centering.
 *
 * Important: if source files were exported in different coordinate frames
 * (scanner vs CAD), automatic registration is NOT attempted here — only a
 * rigid center of the combined bounding box around the shared origin.
 */
export type AlignResult = {
  bounds: SceneBounds;
  primaryId: string | null;
  note?: string;
};

function meshVolume(mesh: AbstractMesh): number {
  try {
    mesh.computeWorldMatrix(true);
    const e = mesh.getBoundingInfo().boundingBox.extendSizeWorld;
    return Math.abs(e.x * e.y * e.z) * 8;
  } catch {
    return 0;
  }
}

/** Pick primary mesh: marked primary, else largest volume (usually a jaw). */
export function pickPrimaryMesh(items: LoadedSceneMesh[]): LoadedSceneMesh | null {
  if (!items.length) return null;
  const marked = items.find((i) => i.mesh.metadata?.opalPrimary === true);
  if (marked) return marked;
  let best = items[0];
  let bestV = -1;
  for (const item of items) {
    const v = meshVolume(item.mesh);
    if (v > bestV) {
      bestV = v;
      best = item;
    }
  }
  return best;
}

/**
 * Center the entire dental root so the union BB center is at world origin.
 * Does NOT randomly move individual meshes relative to each other.
 */
export function centerSceneRoot(
  root: TransformNode,
  meshes: AbstractMesh[],
): SceneBounds | null {
  for (const m of meshes) {
    m.computeWorldMatrix(true);
    m.refreshBoundingInfo(true, true);
  }
  const bounds = computeSceneBounds(meshes);
  if (!bounds) return null;

  // Rigid translate: move root so world center → (0,0,0)
  // Convert world-center offset into root local space (root usually unrotated).
  const worldCenter = bounds.center.clone();
  root.position.subtractInPlace(worldCenter);

  root.computeWorldMatrix(true);
  for (const m of meshes) {
    m.computeWorldMatrix(true);
    m.refreshBoundingInfo(true, true);
    // Store restore position for Reset Scene
    if (!m.metadata) m.metadata = {};
    m.metadata.basePosition = m.position.clone();
    m.metadata.aligned = true;
  }

  return computeSceneBounds(meshes);
}

/**
 * Align scene for viewing: identify primary, center union BB on origin.
 * Relative transforms between meshes are preserved (scanner frame).
 */
export function alignDentalScene(
  root: TransformNode | null,
  items: LoadedSceneMesh[],
): AlignResult | null {
  const meshes = items.map((i) => i.mesh);
  if (!meshes.length) return null;

  const primary = pickPrimaryMesh(items);
  if (primary) {
    primary.mesh.metadata = { ...(primary.mesh.metadata ?? {}), opalPrimary: true };
  }

  // Per-mesh BB cache (debug / future registration)
  for (const item of items) {
    item.mesh.computeWorldMatrix(true);
    item.mesh.refreshBoundingInfo(true, true);
    const bi = item.mesh.getBoundingInfo();
    item.mesh.metadata = {
      ...(item.mesh.metadata ?? {}),
      localCenter: bi.boundingBox.centerWorld.clone(),
      localRadius: bi.boundingBox.extendSizeWorld.length(),
    };
  }

  if (!root) {
    // Fallback: translate each mesh by the same world delta (keeps relative layout)
    const bounds = computeSceneBounds(meshes);
    if (!bounds) return null;
    const delta = bounds.center.negate();
    for (const m of meshes) {
      m.position.addInPlace(delta);
      m.computeWorldMatrix(true);
      m.refreshBoundingInfo(true, true);
      if (!m.metadata) m.metadata = {};
      m.metadata.basePosition = m.position.clone();
    }
    const after = computeSceneBounds(meshes);
    if (!after) return null;
    return {
      bounds: after,
      primaryId: primary?.assetId ?? null,
      note: "Centered union BB (no root). Files keep relative poses.",
    };
  }

  const after = centerSceneRoot(root, meshes);
  if (!after) return null;

  return {
    bounds: after,
    primaryId: primary?.assetId ?? null,
    note:
      "Centered combined scene pivot. If jaws still misaligned, source files use different coordinate frames — registration required.",
  };
}

/** Restore mesh positions after explode / edits (Reset Scene). */
export function restoreMeshBasePositions(meshes: AbstractMesh[]): void {
  for (const m of meshes) {
    const base = m.metadata?.basePosition as Vector3 | undefined;
    if (base) m.position.copyFrom(base);
    m.computeWorldMatrix(true);
  }
}
