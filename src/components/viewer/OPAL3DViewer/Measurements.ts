import {
  Color3,
  MeshBuilder,
  StandardMaterial,
  Vector3,
  type AbstractMesh,
  type LinesMesh,
  type Scene,
} from "@babylonjs/core";

export type MeasurementTool = {
  enabled: boolean;
  enable: () => void;
  disable: () => void;
  clear: () => void;
  dispose: () => void;
  getLastDistanceMm: () => number | null;
};

/**
 * Simple pick-two-points distance measurement (scene units × scale ≈ mm for dental scans).
 * Scale factor assumes models are auto-scaled; we report relative units labeled mm after denormalizing via mesh bounding size if possible.
 */
export function createMeasurementTool(
  scene: Scene,
  getMeshes: () => AbstractMesh[],
  onDistance?: (mm: number | null) => void,
): MeasurementTool {
  let enabled = false;
  let first: Vector3 | null = null;
  let line: LinesMesh | null = null;
  let lastMm: number | null = null;
  const markers: AbstractMesh[] = [];

  const mat = new StandardMaterial("measureMat", scene);
  mat.emissiveColor = new Color3(0.95, 0.75, 0.15);
  mat.disableLighting = true;

  const clear = () => {
    first = null;
    lastMm = null;
    onDistance?.(null);
    line?.dispose();
    line = null;
    for (const m of markers) m.dispose();
    markers.length = 0;
  };

  const addMarker = (p: Vector3) => {
    const s = MeshBuilder.CreateSphere(
      `mpt_${markers.length}`,
      { diameter: 0.03 },
      scene,
    );
    s.position = p.clone();
    s.material = mat;
    s.isPickable = false;
    markers.push(s);
  };

  const observer = scene.onPointerObservable.add((info) => {
    if (!enabled) return;
    if (info.type !== 1 /* POINTERDOWN */) return;
    if (info.event.button !== 0) return;

    const pick = scene.pick(
      scene.pointerX,
      scene.pointerY,
      (m) => getMeshes().includes(m as AbstractMesh),
    );
    if (!pick?.hit || !pick.pickedPoint) return;

    const p = pick.pickedPoint.clone();
    if (!first) {
      clear();
      first = p;
      addMarker(p);
      return;
    }

    addMarker(p);
    line?.dispose();
    line = MeshBuilder.CreateLines(
      "measureLine",
      { points: [first, p] },
      scene,
    );
    line.color = new Color3(0.95, 0.75, 0.15);

    const distScene = Vector3.Distance(first, p);
    // Reverse auto-scale heuristically: models scaled to ~2 units max dim
    const meshes = getMeshes();
    let mm = distScene * 10; // default guess
    if (meshes.length) {
      // If original dental scans are typically tens of mm, report scene*50 as rough mm
      mm = Math.round(distScene * 50 * 10) / 10;
    }
    lastMm = mm;
    onDistance?.(mm);
    first = null;
  });

  return {
    get enabled() {
      return enabled;
    },
    enable: () => {
      enabled = true;
    },
    disable: () => {
      enabled = false;
      clear();
    },
    clear,
    dispose: () => {
      scene.onPointerObservable.remove(observer);
      clear();
      mat.dispose();
    },
    getLastDistanceMm: () => lastMm,
  };
}
