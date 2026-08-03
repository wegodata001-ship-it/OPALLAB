import {
  HardwareScalingOptimization,
  MergeMeshesOptimization,
  SceneOptimizer,
  SceneOptimizerOptions,
  ShadowsOptimization,
  TextureOptimization,
  type AbstractMesh,
  type Engine,
  type Scene,
} from "@babylonjs/core";

export type PerfHandle = {
  optimizer: SceneOptimizer | null;
  stop: () => void;
};

/** Scene optimizer + hardware scaling for large dental scans. */
export function startSceneOptimizer(scene: Scene, targetFps = 45): PerfHandle {
  const options = new SceneOptimizerOptions(targetFps, 2000);
  options.addOptimization(new ShadowsOptimization(0));
  options.addOptimization(new TextureOptimization(1, 1024));
  options.addOptimization(new HardwareScalingOptimization(2, 1.5));
  options.addOptimization(new MergeMeshesOptimization(3));

  const optimizer = new SceneOptimizer(scene, options);
  optimizer.start();

  return {
    optimizer,
    stop: () => {
      try {
        optimizer.stop();
        optimizer.dispose();
      } catch {
        /* ignore */
      }
    },
  };
}

export function applyHardwareScaling(engine: Engine, largeModel: boolean): void {
  // Slight downscale on huge models for smoother interaction
  engine.setHardwareScalingLevel(largeModel ? 1.25 : 1);
}

export function freezeLoadedMeshes(meshes: AbstractMesh[]): void {
  for (const mesh of meshes) {
    try {
      mesh.freezeWorldMatrix();
      if (mesh.material) {
        mesh.material.freeze();
      }
    } catch {
      /* ignore */
    }
  }
}

export function unfreezeMeshes(meshes: AbstractMesh[]): void {
  for (const mesh of meshes) {
    try {
      mesh.unfreezeWorldMatrix();
      mesh.material?.unfreeze?.();
    } catch {
      /* ignore */
    }
  }
}

export function createOctreeIfLarge(scene: Scene, meshes: AbstractMesh[]): void {
  const totalVerts = meshes.reduce((s, m) => s + (m.getTotalVertices?.() ?? 0), 0);
  if (totalVerts < 500_000) return;
  try {
    // Babylon octree for picking/culling on dense meshes
    scene.createOrUpdateSelectionOctree(64);
  } catch {
    /* optional */
  }
}

export function estimateVertexCount(meshes: AbstractMesh[]): number {
  return meshes.reduce((s, m) => s + (m.getTotalVertices?.() ?? 0), 0);
}
