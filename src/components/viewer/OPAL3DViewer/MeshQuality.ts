import { Mesh, VertexBuffer, type AbstractMesh } from "@babylonjs/core";

/**
 * Dental mesh quality pass — weld, smooth normals, optimize.
 * Preserves vertex colors when possible.
 */
export function repairDentalMesh(mesh: AbstractMesh): void {
  if (!(mesh instanceof Mesh)) return;

  const colors = mesh.getVerticesData(VertexBuffer.ColorKind);
  const before = mesh.getTotalVertices?.() ?? 0;

  try {
    mesh.forceSharedVertices();
  } catch {
    /* ignore */
  }
  // If weld destroyed geometry, stop further aggressive ops
  if (before >= 3 && (mesh.getTotalVertices?.() ?? 0) < 3) {
    return;
  }

  try {
    const m = mesh as Mesh & { removeDuplicateVertices?: () => void };
    m.removeDuplicateVertices?.();
  } catch {
    /* ignore */
  }
  try {
    mesh.createNormals(true);
  } catch {
    try {
      mesh.createNormals(false);
    } catch {
      /* ignore */
    }
  }
  try {
    mesh.optimizeIndices();
  } catch {
    /* ignore */
  }

  if (colors && colors.length && !mesh.isVerticesDataPresent(VertexBuffer.ColorKind)) {
    try {
      mesh.setVerticesData(VertexBuffer.ColorKind, colors, false);
    } catch {
      /* ignore */
    }
  }

  try {
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo(true, true);
  } catch {
    /* ignore */
  }
}
