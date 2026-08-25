import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.js";
import { expect, test } from "vite-plus/test";
import {
  createWorldPresentation,
  markAsVirtualBackground,
  VIRTUAL_BACKGROUND_LAYER_MASK,
} from "./world-presentation.ts";

test("AR wraps and fits the existing foreground while ignoring its virtual sky", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.activeCamera = new FreeCamera("camera", new Vector3(0, 2, -5), scene);
  const presentation = createWorldPresentation(scene);
  const subject = MeshBuilder.CreateBox("subject", { size: 2 }, scene);
  subject.position.y = 2;
  const atmosphere = MeshBuilder.CreateSphere("atmosphere", { diameter: 2 }, scene);
  atmosphere.position.y = 2;
  atmosphere.freezeWorldMatrix();
  const sky = markAsVirtualBackground(MeshBuilder.CreateSphere("sky", { diameter: 1_000 }, scene));

  presentation.capture({
    lights: [],
    meshes: [presentation.proxy, subject, atmosphere, sky],
    transformNodes: [...scene.transformNodes],
  });

  expect(sky.layerMask).toBe(VIRTUAL_BACKGROUND_LAYER_MASK);
  expect(sky.parent).toBeNull();
  expect(subject.parent?.name).toBe("world-presentation-contents");
  expect(subject.getAbsolutePosition().asArray()).toEqual([0, 2, 0]);

  presentation.beginAr();
  expect(presentation.proxy.isEnabled()).toBe(false);
  presentation.place(new Vector3(1, 0, 3));
  scene.render();

  // A two-unit foreground becomes a 68 cm tabletop object. The kilometre-wide virtual sky does
  // not participate in fitting, and the original lower edge (y=1) lands on the physical plane.
  expect(presentation.proxy.scaling.x).toBeCloseTo(0.34);
  expect(presentation.proxy.position.asArray()).toEqual([1, -0.34, 3]);
  const placedAtmosphere = atmosphere.getAbsolutePosition();
  expect(placedAtmosphere.x).toBeCloseTo(1);
  expect(placedAtmosphere.y).toBeCloseTo(0.34);
  expect(placedAtmosphere.z).toBeCloseTo(3);
  expect(atmosphere.isWorldMatrixFrozen).toBe(false);

  presentation.endAr();
  subject.computeWorldMatrix(true);
  expect(subject.getAbsolutePosition().asArray()).toEqual([0, 2, 0]);
  expect(presentation.proxy.scaling.asArray()).toEqual([1, 1, 1]);
  expect(atmosphere.getAbsolutePosition().asArray()).toEqual([0, 2, 0]);
  expect(atmosphere.isWorldMatrixFrozen).toBe(true);

  presentation.dispose();
  scene.dispose();
  engine.dispose();
});
