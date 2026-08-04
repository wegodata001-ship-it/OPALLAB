import type { AbstractMesh } from "@babylonjs/core";
import type { SceneLayerId, SceneLayerState } from "./types";
import { LAYER_LABELS, LAYER_ORDER } from "./Utils";
import type { LoadedSceneMesh } from "./Loaders";
import { setMeshVisibility } from "./Materials";

export function buildLayerStates(items: LoadedSceneMesh[]): SceneLayerState[] {
  const counts = new Map<SceneLayerId, number>();
  for (const item of items) {
    counts.set(item.layer, (counts.get(item.layer) ?? 0) + 1);
  }
  return LAYER_ORDER.filter((id) => (counts.get(id) ?? 0) > 0).map((id) => ({
    id,
    label: LAYER_LABELS[id],
    visible: true,
    locked: false,
    count: counts.get(id) ?? 0,
  }));
}

export function applyLayerVisibility(
  items: LoadedSceneMesh[],
  visibility: Record<SceneLayerId, boolean>,
): void {
  const byLayer = new Map<SceneLayerId, AbstractMesh[]>();
  for (const item of items) {
    const list = byLayer.get(item.layer) ?? [];
    list.push(item.mesh);
    byLayer.set(item.layer, list);
  }
  for (const [layer, meshes] of byLayer) {
    const visible = visibility[layer] !== false;
    setMeshVisibility(meshes, visible);
  }
}

export function toggleLayer(
  current: SceneLayerState[],
  id: SceneLayerId,
): SceneLayerState[] {
  return current.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l));
}

export function layerVisibilityMap(states: SceneLayerState[]): Record<SceneLayerId, boolean> {
  const map = {} as Record<SceneLayerId, boolean>;
  for (const s of states) map[s.id] = s.visible;
  return map;
}
