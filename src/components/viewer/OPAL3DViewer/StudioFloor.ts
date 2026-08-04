import {
  Color3,
  MeshBuilder,
  StandardMaterial,
  type AbstractMesh,
  type Mesh,
  type Scene,
} from "@babylonjs/core";

export type StudioFloorHandle = {
  catcher: Mesh;
  mirror: Mesh | null;
  setVisible: (v: boolean) => void;
  syncSize: (span: number) => void;
  dispose: () => void;
};

/**
 * Soft shadow catcher only — MirrorTexture removed (was unstable / broke OBJ loads).
 */
export function createStudioFloor(scene: Scene): StudioFloorHandle {
  const catcher = MeshBuilder.CreateGround("opalShadowCatcher", { width: 200, height: 200 }, scene);
  catcher.position.y = -0.05;
  catcher.isPickable = false;
  catcher.receiveShadows = true;

  const catcherMat = new StandardMaterial("opalCatcherMat", scene);
  catcherMat.diffuseColor = new Color3(0.14, 0.15, 0.17);
  catcherMat.specularColor = Color3.Black();
  catcherMat.emissiveColor = new Color3(0.02, 0.02, 0.025);
  catcherMat.alpha = 0.28;
  catcherMat.backFaceCulling = false;
  catcher.material = catcherMat;
  catcher.visibility = 0.45;

  return {
    catcher,
    mirror: null,
    setVisible: (v) => {
      catcher.setEnabled(v);
      catcher.isVisible = v;
    },
    syncSize: (span) => {
      const s = Math.max(40, Math.min(span * 2.4, 400));
      catcher.scaling.set(s / 200, 1, s / 200);
    },
    dispose: () => {
      try {
        catcher.dispose(true, true);
      } catch {
        /* ignore */
      }
    },
  };
}

export function syncFloorReflection(
  _floor: StudioFloorHandle | null,
  _meshes: AbstractMesh[],
): void {
  // Mirror reflection disabled for stability
}
