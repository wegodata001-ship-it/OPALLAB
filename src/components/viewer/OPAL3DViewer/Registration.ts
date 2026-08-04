import {
  Matrix,
  Quaternion,
  TransformNode,
  Vector3,
  type AbstractMesh,
  type Scene,
} from "@babylonjs/core";
import { computeSceneBounds, type SceneBounds } from "./Camera";
import type { LoadedSceneMesh } from "./Loaders";
import type { RegistrationMode, SceneAsset, TransformMeta } from "./types";

export type AssetNode = {
  assetId: string;
  node: TransformNode;
  hasManufacturerTransform: boolean;
  transform: TransformMeta | null;
};

export type RegistrationResult = {
  mode: RegistrationMode;
  assetNodes: AssetNode[];
  bounds: SceneBounds | null;
  manufacturerCount: number;
  note: string;
};

/** True if transform carries usable pose data. */
export function hasUsableTransform(t?: TransformMeta | null): boolean {
  if (!t) return false;
  if (t.matrix && t.matrix.length >= 16) return true;
  if (t.scannerMatrix && t.scannerMatrix.length >= 16) return true;
  if (t.translation) return true;
  if (t.rotation || t.rotationQuaternion) return true;
  if (t.scale != null) return true;
  return false;
}

/** Resolve transform from asset / modelMeta / sidecar JSON text. */
export function resolveTransformMeta(asset: SceneAsset, sidecar?: unknown): TransformMeta | null {
  if (hasUsableTransform(asset.transform)) return asset.transform ?? null;
  if (hasUsableTransform(asset.modelMeta?.transform)) return asset.modelMeta?.transform ?? null;
  if (sidecar && typeof sidecar === "object") {
    const parsed = parseTransformObject(sidecar);
    if (hasUsableTransform(parsed)) return parsed;
  }
  return null;
}

export function parseTransformObject(raw: unknown): TransformMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const out: TransformMeta = { source: "sidecar" };

  const mat = o.matrix ?? o.scannerMatrix ?? o.transform;
  if (Array.isArray(mat) && mat.length >= 16 && mat.every((n) => typeof n === "number")) {
    out.matrix = mat as number[];
    if (o.scannerMatrix) out.scannerMatrix = o.scannerMatrix as number[];
  }
  if (Array.isArray(o.translation) && o.translation.length >= 3) {
    out.translation = o.translation as [number, number, number];
  }
  if (Array.isArray(o.position) && o.position.length >= 3) {
    out.translation = o.position as [number, number, number];
  }
  if (Array.isArray(o.rotation) && o.rotation.length >= 3) {
    out.rotation = o.rotation as [number, number, number];
  }
  if (Array.isArray(o.rotationQuaternion) && o.rotationQuaternion.length >= 4) {
    out.rotationQuaternion = o.rotationQuaternion as [number, number, number, number];
  }
  if (typeof o.scale === "number") out.scale = o.scale;
  else if (Array.isArray(o.scale) && o.scale.length >= 3) {
    out.scale = o.scale as [number, number, number];
  }
  if (Array.isArray(o.localOrigin) && o.localOrigin.length >= 3) {
    out.localOrigin = o.localOrigin as [number, number, number];
  }
  return hasUsableTransform(out) ? out : null;
}

export function applyTransformToNode(node: TransformNode, t: TransformMeta): void {
  const matrixArr = t.matrix ?? t.scannerMatrix;
  if (matrixArr && matrixArr.length >= 16) {
    const m = Matrix.FromArray(matrixArr);
    // Babylon uses row-major FromArray; if looks transposed, still apply as-is (manufacturer)
    const scale = new Vector3();
    const rotation = new Quaternion();
    const position = new Vector3();
    m.decompose(scale, rotation, position);
    node.position.copyFrom(position);
    node.rotationQuaternion = rotation;
    node.scaling.copyFrom(scale);
  } else {
    if (t.translation) {
      node.position.set(t.translation[0], t.translation[1], t.translation[2]);
    }
    if (t.localOrigin) {
      node.position.subtractInPlace(
        new Vector3(t.localOrigin[0], t.localOrigin[1], t.localOrigin[2]),
      );
    }
    if (t.rotationQuaternion) {
      node.rotationQuaternion = new Quaternion(
        t.rotationQuaternion[0],
        t.rotationQuaternion[1],
        t.rotationQuaternion[2],
        t.rotationQuaternion[3],
      );
    } else if (t.rotation) {
      const deg = Math.PI / 180;
      node.rotation.set(t.rotation[0] * deg, t.rotation[1] * deg, t.rotation[2] * deg);
      node.rotationQuaternion = null;
    }
    if (typeof t.scale === "number") {
      node.scaling.setAll(t.scale);
    } else if (Array.isArray(t.scale)) {
      node.scaling.set(t.scale[0], t.scale[1], t.scale[2]);
    }
  }
  node.computeWorldMatrix(true);
}

/**
 * Build per-asset transform nodes under dental root.
 * Meshes keep relative poses — never center each mesh alone.
 */
export function buildAssetNodes(
  scene: Scene,
  root: TransformNode,
  items: LoadedSceneMesh[],
  assets: SceneAsset[],
  sidecarByAssetId?: Map<string, TransformMeta | null>,
): AssetNode[] {
  const byAsset = new Map<string, LoadedSceneMesh[]>();
  for (const item of items) {
    const list = byAsset.get(item.assetId) ?? [];
    list.push(item);
    byAsset.set(item.assetId, list);
  }

  const nodes: AssetNode[] = [];
  for (const [assetId, meshes] of byAsset) {
    const asset = assets.find((a) => a.id === assetId);
    const transform =
      resolveTransformMeta(asset ?? { id: assetId, fileName: meshes[0]?.fileName ?? assetId }, sidecarByAssetId?.get(assetId)) ??
      null;
    const node = new TransformNode(`opalAsset_${assetId}`, scene);
    node.parent = root;
    for (const item of meshes) {
      item.mesh.parent = node;
      item.mesh.unfreezeWorldMatrix();
    }
    if (hasUsableTransform(transform)) {
      applyTransformToNode(node, transform!);
    }
    // Store manual baseline
    node.metadata = {
      basePosition: node.position.clone(),
      baseRotation: node.rotation.clone(),
      baseScaling: node.scaling.clone(),
      baseRotationQuaternion: node.rotationQuaternion?.clone() ?? null,
      transform,
    };
    for (const item of meshes) {
      item.mesh.metadata = {
        ...(item.mesh.metadata ?? {}),
        opalAssetNode: assetId,
        hasTransform: hasUsableTransform(transform),
      };
      item.mesh.computeWorldMatrix(true);
      item.mesh.refreshBoundingInfo(true, true);
    }
    nodes.push({
      assetId,
      node,
      hasManufacturerTransform: hasUsableTransform(transform),
      transform,
    });
  }
  return nodes;
}

/**
 * Registration policy:
 * - Any manufacturer transforms → keep poses, do NOT auto-center
 * - None → rigid scene-center of the whole root (relative poses preserved)
 * - Manual mode skips auto-center
 */
export function registerDentalScene(input: {
  root: TransformNode;
  items: LoadedSceneMesh[];
  assetNodes: AssetNode[];
  forceMode?: RegistrationMode;
}): RegistrationResult {
  const manufacturerCount = input.assetNodes.filter((n) => n.hasManufacturerTransform).length;
  let mode: RegistrationMode =
    input.forceMode ?? (manufacturerCount > 0 ? "manufacturer" : "scene-center");

  const meshes = input.items.map((i) => i.mesh);
  for (const m of meshes) {
    m.computeWorldMatrix(true);
    m.refreshBoundingInfo(true, true);
  }

  if (mode === "manufacturer") {
    const bounds = computeSceneBounds(meshes);
    return {
      mode,
      assetNodes: input.assetNodes,
      bounds,
      manufacturerCount,
      note: `Applied ${manufacturerCount} manufacturer transform(s). Relative dental poses preserved — no auto-center.`,
    };
  }

  if (mode === "manual") {
    const bounds = computeSceneBounds(meshes);
    return {
      mode,
      assetNodes: input.assetNodes,
      bounds,
      manufacturerCount,
      note: "Manual alignment mode — adjust transforms, then Apply.",
    };
  }

  // scene-center: rigid translate root only
  const bounds = computeSceneBounds(meshes);
  if (bounds) {
    input.root.position.subtractInPlace(bounds.center);
    input.root.computeWorldMatrix(true);
    for (const m of meshes) {
      m.computeWorldMatrix(true);
      m.refreshBoundingInfo(true, true);
    }
  }
  const after = computeSceneBounds(meshes);
  // Store baselines on asset nodes after centering
  for (const an of input.assetNodes) {
    an.node.metadata = {
      ...(an.node.metadata ?? {}),
      basePosition: an.node.position.clone(),
      baseRotation: an.node.rotation.clone(),
      baseScaling: an.node.scaling.clone(),
    };
  }

  return {
    mode: "scene-center",
    assetNodes: input.assetNodes,
    bounds: after,
    manufacturerCount,
    note: "No manufacturer transforms — centered entire scene as one rigid body (relative poses kept).",
  };
}

export function setManualTransform(
  node: TransformNode,
  values: {
    moveX?: number;
    moveY?: number;
    moveZ?: number;
    rotX?: number;
    rotY?: number;
    rotZ?: number;
    scale?: number;
  },
): void {
  node.unfreezeWorldMatrix();
  const meta = node.metadata ?? {};
  const basePos = (meta.basePosition as Vector3 | undefined) ?? node.position.clone();
  const deg = Math.PI / 180;
  node.position.set(
    basePos.x + (values.moveX ?? 0),
    basePos.y + (values.moveY ?? 0),
    basePos.z + (values.moveZ ?? 0),
  );
  node.rotationQuaternion = null;
  node.rotation.set(
    (values.rotX ?? 0) * deg,
    (values.rotY ?? 0) * deg,
    (values.rotZ ?? 0) * deg,
  );
  const s = values.scale ?? 1;
  node.scaling.setAll(s);
  node.computeWorldMatrix(true);
}

export function applyManualAsBaseline(node: TransformNode): void {
  node.metadata = {
    ...(node.metadata ?? {}),
    basePosition: node.position.clone(),
    baseRotation: node.rotation.clone(),
    baseScaling: node.scaling.clone(),
    transform: {
      translation: [node.position.x, node.position.y, node.position.z],
      rotation: [
        (node.rotation.x * 180) / Math.PI,
        (node.rotation.y * 180) / Math.PI,
        (node.rotation.z * 180) / Math.PI,
      ],
      scale: node.scaling.x,
      source: "manual",
    } satisfies TransformMeta,
  };
}

export function resetManualNode(node: TransformNode): void {
  const meta = node.metadata ?? {};
  const basePos = meta.basePosition as Vector3 | undefined;
  const baseRot = meta.baseRotation as Vector3 | undefined;
  const baseScale = meta.baseScaling as Vector3 | undefined;
  if (basePos) node.position.copyFrom(basePos);
  if (baseRot) {
    node.rotationQuaternion = null;
    node.rotation.copyFrom(baseRot);
  }
  if (baseScale) node.scaling.copyFrom(baseScale);
  node.computeWorldMatrix(true);
}

export function validateAlignment(items: LoadedSceneMesh[]): {
  ok: boolean;
  overlapHint: boolean;
} {
  const bounds = items.map((i) => {
    i.mesh.computeWorldMatrix(true);
    return i.mesh.getBoundingInfo().boundingBox.centerWorld;
  });
  if (bounds.length < 2) return { ok: true, overlapHint: false };
  // If all centers identical → likely each was wrongly centered alone
  const first = bounds[0];
  const allSame = bounds.every((c) => c.equalsWithEpsilon(first, 0.01));
  return { ok: !allSame, overlapHint: allSame };
}
