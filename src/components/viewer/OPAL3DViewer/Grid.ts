import {
  Color3,
  MeshBuilder,
  Vector3,
  type Mesh,
  type Scene,
} from "@babylonjs/core";

export type DentalGrid = {
  root: Mesh;
  setVisible: (v: boolean) => void;
  dispose: () => void;
};

/**
 * Thin dental work grid — opacity ~15%, center axes emphasized, off by default.
 * Fade-with-distance approximated via low alpha + smaller extent.
 */
export function createDentalGrid(scene: Scene, size = 48, step = 4): DentalGrid {
  const lines: Vector3[][] = [];
  const half = size / 2;
  for (let i = -half; i <= half; i += step) {
    if (Math.abs(i) < 0.001) continue; // center drawn separately
    lines.push([new Vector3(i, 0, -half), new Vector3(i, 0, half)]);
    lines.push([new Vector3(-half, 0, i), new Vector3(half, 0, i)]);
  }

  const grid = MeshBuilder.CreateLineSystem("opalDentalGrid", { lines }, scene);
  grid.color = new Color3(0.55, 0.57, 0.6);
  grid.alpha = 0.15;
  grid.isPickable = false;
  grid.renderingGroupId = 0;
  grid.position.y = -0.02;

  const originX = MeshBuilder.CreateLines(
    "opalOriginX",
    { points: [new Vector3(-half, 0.01, 0), new Vector3(half, 0.01, 0)] },
    scene,
  );
  originX.color = new Color3(0.7, 0.35, 0.32);
  originX.alpha = 0.4;
  originX.isPickable = false;
  originX.parent = grid;

  const originZ = MeshBuilder.CreateLines(
    "opalOriginZ",
    { points: [new Vector3(0, 0.01, -half), new Vector3(0, 0.01, half)] },
    scene,
  );
  originZ.color = new Color3(0.35, 0.48, 0.7);
  originZ.alpha = 0.4;
  originZ.isPickable = false;
  originZ.parent = grid;

  // Distance fade: hide fine grid when camera is far (updated by host optionally)
  const updateFade = () => {
    const cam = scene.activeCamera;
    if (!cam || !("radius" in cam)) return;
    const r = (cam as { radius: number }).radius;
    const fade = Math.max(0.04, Math.min(0.15, 18 / Math.max(r, 1)));
    grid.alpha = fade;
  };
  const obs = scene.onBeforeRenderObservable.add(updateFade);

  grid.setEnabled(false);
  grid.isVisible = false;

  return {
    root: grid,
    setVisible: (v) => {
      grid.setEnabled(v);
      grid.isVisible = v;
    },
    dispose: () => {
      scene.onBeforeRenderObservable.remove(obs);
      originX.dispose();
      originZ.dispose();
      grid.dispose();
    },
  };
}
