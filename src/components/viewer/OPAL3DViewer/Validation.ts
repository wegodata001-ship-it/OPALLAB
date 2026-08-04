import { VertexBuffer, type AbstractMesh } from "@babylonjs/core";
import type { LoadedSceneMesh } from "./Loaders";
import type { SceneWarning } from "./types";

/**
 * Post-load dental scene validation.
 */
export function validateDentalScene(items: LoadedSceneMesh[]): SceneWarning[] {
  const warnings: SceneWarning[] = [];
  if (!items.length) {
    warnings.push({ code: "MISSING_MESH", message: "No meshes loaded into the dental scene." });
    return warnings;
  }

  const nameCount = new Map<string, number>();
  let maxDim = 0;
  let minDim = Infinity;

  for (const item of items) {
    const mesh = item.mesh;
    const key = item.fileName.toLowerCase();
    nameCount.set(key, (nameCount.get(key) ?? 0) + 1);

    const verts = mesh.getTotalVertices?.() ?? 0;
    // Empty helper nodes are filtered at load — only warn if somehow still present
    if (verts < 3) {
      continue;
    }

    const hasNormals = mesh.isVerticesDataPresent?.(VertexBuffer.NormalKind);
    if (!hasNormals) {
      warnings.push({
        code: "INVALID_NORMALS",
        message: `Missing normals: ${item.fileName}`,
        assetId: item.assetId,
        fileName: item.fileName,
      });
    }

    try {
      mesh.computeWorldMatrix(true);
      mesh.refreshBoundingInfo(true, true);
      const e = mesh.getBoundingInfo().boundingBox.extendSizeWorld;
      const dim = Math.max(e.x, e.y, e.z) * 2;
      maxDim = Math.max(maxDim, dim);
      minDim = Math.min(minDim, dim);
      if (dim > 5000) {
        warnings.push({
          code: "HUGE_SCALE",
          message: `Huge scale detected (${dim.toFixed(0)}): ${item.fileName}`,
          assetId: item.assetId,
          fileName: item.fileName,
        });
      }
      if (dim > 0 && dim < 0.05) {
        warnings.push({
          code: "WRONG_UNITS",
          message: `Possible wrong units (very small): ${item.fileName}`,
          assetId: item.assetId,
          fileName: item.fileName,
        });
      }
    } catch {
      warnings.push({
        code: "BROKEN_GEOMETRY",
        message: `Bounding box failed: ${item.fileName}`,
        assetId: item.assetId,
        fileName: item.fileName,
      });
    }

    if (!item.mesh.metadata?.hasTransform) {
      // informational only once per scene later
    }
  }

  for (const [name, count] of nameCount) {
    if (count > 1) {
      warnings.push({
        code: "DUPLICATE_MESH",
        message: `Duplicate mesh name loaded ${count}×: ${name}`,
        fileName: name,
      });
    }
  }

  if (Number.isFinite(minDim) && maxDim > 0 && maxDim / Math.max(minDim, 1e-6) > 500) {
    warnings.push({
      code: "WRONG_UNITS",
      message: "Large scale mismatch between meshes — check mm vs m units.",
    });
  }

  const withoutXform = items.filter((i) => !i.mesh.metadata?.hasTransform);
  if (withoutXform.length === items.length && items.length > 1) {
    warnings.push({
      code: "NO_TRANSFORM",
      message:
        "No manufacturer transforms found. Scene was centered as one rigid body — use Manual Alignment if jaws are wrong.",
    });
  }

  return warnings;
}

export function meshHasValidNormals(mesh: AbstractMesh): boolean {
  return !!mesh.isVerticesDataPresent?.(VertexBuffer.NormalKind);
}
