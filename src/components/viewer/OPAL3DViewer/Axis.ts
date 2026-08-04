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

/**
 * Small XYZ gizmo pinned to lower-left (Exocad-style), NOT on the model center.
 */
export function createAxisGizmo(scene: Scene): AxisGizmo {
  const root = MeshBuilder.CreateBox("opalAxisRoot", { size: 0.001 }, scene);
  root.isVisible = false;
  root.isPickable = false;
  root.scaling.setAll(0.16);

  const makeAxis = (name: string, dir: Vector3, color: Color3, letter: string) => {
    const shaft = MeshBuilder.CreateCylinder(
      name,
      { height: 1.0, diameter: 0.07, tessellation: 6 },
      scene,
    );
    shaft.parent = root;
    shaft.position = dir.scale(0.5);
    if (Math.abs(dir.x) > 0.5) shaft.rotation.z = Math.PI / 2;
    if (Math.abs(dir.z) > 0.5) shaft.rotation.x = Math.PI / 2;
    const mat = new StandardMaterial(`${name}Mat`, scene);
    mat.emissiveColor = color;
    mat.disableLighting = true;
    mat.diffuseColor = color;
    shaft.material = mat;
    shaft.isPickable = false;
    shaft.renderingGroupId = 3;
    shaft.alwaysSelectAsActiveMesh = true;

    const tip = MeshBuilder.CreateCylinder(
      `${name}Tip`,
      { height: 0.22, diameterTop: 0, diameterBottom: 0.14, tessellation: 6 },
      scene,
    );
    tip.parent = root;
    tip.position = dir.scale(1.12);
    if (Math.abs(dir.x) > 0.5) tip.rotation.z = -Math.PI / 2;
    if (Math.abs(dir.z) > 0.5) tip.rotation.x = Math.PI / 2;
    tip.material = mat;
    tip.isPickable = false;
    tip.renderingGroupId = 3;

    const label = MeshBuilder.CreatePlane(`${name}Label`, { size: 0.32 }, scene);
    label.parent = root;
    label.position = dir.scale(1.4);
    label.billboardMode = 7;
    const dt = new DynamicTexture(`${name}Tex`, { width: 64, height: 64 }, scene, false);
    dt.hasAlpha = true;
    dt.drawText(letter, null, null, "bold 40px sans-serif", color.toHexString(), "transparent", true);
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

  makeAxis("opalAxisX", new Vector3(1, 0, 0), new Color3(0.9, 0.22, 0.2), "X");
  makeAxis("opalAxisY", new Vector3(0, 1, 0), new Color3(0.28, 0.78, 0.32), "Y");
  makeAxis("opalAxisZ", new Vector3(0, 0, 1), new Color3(0.28, 0.48, 0.95), "Z");

  const obs = scene.onBeforeRenderObservable.add(() => {
    const camera = scene.activeCamera;
    if (!camera) return;
    // Lower-left of the view, close to camera (screen corner feel)
    const forward = camera.getDirection(Vector3.Forward()).normalize();
    const right = camera.getDirection(Vector3.Right()).normalize();
    const up = camera.getDirection(Vector3.Up()).normalize();
    const dist = 3.2;
    const pos = camera.position
      .add(forward.scale(dist))
      .add(right.scale(-1.85))
      .add(up.scale(-1.25));
    root.position.copyFrom(pos);
    // Keep tiny
    root.scaling.setAll(0.14);
  });

  return {
    root,
    dispose: () => {
      scene.onBeforeRenderObservable.remove(obs);
      root.dispose(false, true);
    },
  };
}
