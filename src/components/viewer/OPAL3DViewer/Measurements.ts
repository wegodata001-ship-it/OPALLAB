import {
  Color3,
  LinesMesh,
  MeshBuilder,
  PointerEventTypes,
  StandardMaterial,
  Vector3,
  type AbstractMesh,
  type Observer,
  type PointerInfo,
  type Scene,
} from "@babylonjs/core";

export type MeasurementTool = {
  setEnabled: (on: boolean) => void;
  clear: () => void;
  dispose: () => void;
};

export function createMeasurementTool(
  scene: Scene,
  getMeshes: () => AbstractMesh[],
  onDistance: (mm: number | null) => void,
): MeasurementTool {
  let enabled = false;
  let points: Vector3[] = [];
  const markers: AbstractMesh[] = [];
  let line: LinesMesh | null = null;
  let obs: Observer<PointerInfo> | null = null;

  const clear = () => {
    for (const m of markers) m.dispose();
    markers.length = 0;
    line?.dispose();
    line = null;
    points = [];
    onDistance(null);
  };

  const addMarker = (p: Vector3) => {
    const s = MeshBuilder.CreateSphere(`m${markers.length}`, { diameter: 0.6 }, scene);
    s.position.copyFrom(p);
    const mat = new StandardMaterial(`mMat${markers.length}`, scene);
    mat.emissiveColor = new Color3(1, 0.75, 0.2);
    mat.disableLighting = true;
    s.material = mat;
    s.isPickable = false;
    markers.push(s);
  };

  const drawLine = () => {
    line?.dispose();
    if (points.length < 2) return;
    line = MeshBuilder.CreateLines(
      "measureLine",
      { points: [points[0], points[1]], updatable: false },
      scene,
    );
    line.color = new Color3(1, 0.85, 0.2);
  };

  const onPointer = (info: PointerInfo) => {
    if (!enabled) return;
    if (info.type !== PointerEventTypes.POINTERTAP) return;
    const pick = scene.pick(scene.pointerX, scene.pointerY, (m) =>
      getMeshes().includes(m),
    );
    if (!pick?.hit || !pick.pickedPoint) return;
    if (points.length >= 2) clear();
    points.push(pick.pickedPoint.clone());
    addMarker(pick.pickedPoint);
    if (points.length === 2) {
      drawLine();
      const dist = Vector3.Distance(points[0], points[1]);
      onDistance(Math.round(dist * 100) / 100);
    }
  };

  obs = scene.onPointerObservable.add(onPointer);

  return {
    setEnabled: (on) => {
      enabled = on;
      if (!on) clear();
    },
    clear,
    dispose: () => {
      clear();
      if (obs) scene.onPointerObservable.remove(obs);
      obs = null;
    },
  };
}
