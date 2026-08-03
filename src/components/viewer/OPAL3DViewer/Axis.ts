import {
  Color3,
  DynamicTexture,
  MeshBuilder,
  StandardMaterial,
  Vector3,
  type Scene,
  type TransformNode,
} from "@babylonjs/core";

export type AxisGizmo = {
  root: TransformNode;
  dispose: () => void;
};

/** Corner XYZ axis — X red, Y green, Z blue. */
export function createAxisGizmo(scene: Scene): AxisGizmo {
  const root = MeshBuilder.CreateBox("opalAxisRoot", { size: 0.01 }, scene);
  root.isVisible = false;
  root.isPickable = false;

  const makeAxis = (name: string, dir: Vector3, color: Color3) => {
    const shaft = MeshBuilder.CreateCylinder(
      name,
      { height: 1.2, diameter: 0.06, tessellation: 8 },
      scene,
    );
    shaft.parent = root;
    shaft.position = dir.scale(0.6);
    if (Math.abs(dir.x) > 0.5) shaft.rotation.z = Math.PI / 2;
    if (Math.abs(dir.z) > 0.5) shaft.rotation.x = Math.PI / 2;
    const mat = new StandardMaterial(`${name}Mat`, scene);
    mat.emissiveColor = color;
    mat.disableLighting = true;
    mat.diffuseColor = color;
    shaft.material = mat;
    shaft.isPickable = false;
    shaft.renderingGroupId = 3;

    const tip = MeshBuilder.CreateCylinder(
      `${name}Tip`,
      { height: 0.28, diameterTop: 0, diameterBottom: 0.16, tessellation: 8 },
      scene,
    );
    tip.parent = root;
    tip.position = dir.scale(1.35);
    if (Math.abs(dir.x) > 0.5) tip.rotation.z = -Math.PI / 2;
    if (Math.abs(dir.z) > 0.5) tip.rotation.x = Math.PI / 2;
    if (dir.y < 0) tip.rotation.x = Math.PI;
    tip.material = mat;
    tip.isPickable = false;
    tip.renderingGroupId = 3;

    const label = MeshBuilder.CreatePlane(`${name}Label`, { size: 0.45 }, scene);
    label.parent = root;
    label.position = dir.scale(1.7);
    label.billboardMode = 7;
    const dt = new DynamicTexture(`${name}Tex`, { width: 64, height: 64 }, scene, false);
    dt.hasAlpha = true;
    const labelChar = name.replace("opalAxis", "");
    dt.drawText(labelChar, null, null, "bold 42px sans-serif", color.toHexString(), "transparent", true);
    const lmat = new StandardMaterial(`${name}LMat`, scene);
    lmat.diffuseTexture = dt;
    lmat.emissiveTexture = dt;
    lmat.opacityTexture = dt;
    lmat.backFaceCulling = false;
    lmat.disableLighting = true;
    label.material = lmat;
    label.isPickable = false;
    label.renderingGroupId = 3;
  };

  makeAxis("opalAxisX", new Vector3(1, 0, 0), new Color3(0.9, 0.2, 0.2));
  makeAxis("opalAxisY", new Vector3(0, 1, 0), new Color3(0.25, 0.75, 0.3));
  makeAxis("opalAxisZ", new Vector3(0, 0, 1), new Color3(0.25, 0.45, 0.95));

  // Keep gizmo in corner via observer
  const cam = scene.activeCamera;
  const obs = scene.onBeforeRenderObservable.add(() => {
    const camera = scene.activeCamera ?? cam;
    if (!camera) return;
    // Place in lower-left of view in world space near camera
    const forward = camera.getDirection(Vector3.Forward());
    const right = camera.getDirection(Vector3.Right());
    const up = camera.getDirection(Vector3.Up());
    const pos = camera.position
      .add(forward.scale(6))
      .add(right.scale(-3.2))
      .add(up.scale(-2.2));
    root.position.copyFrom(pos);
    root.scaling.setAll(0.55);
  });

  return {
    root,
    dispose: () => {
      scene.onBeforeRenderObservable.remove(obs);
      root.dispose(false, true);
    },
  };
}
