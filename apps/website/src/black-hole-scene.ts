import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import {
  createLensingMaterial,
  LENSING_BOUND_RADII,
  SHADOW_TO_SCHWARZSCHILD,
} from "./black-hole-lensing.ts";
import type { BlackHoleProfile } from "./black-holes.ts";
import type { MountedWorld, SceneHost } from "./scene-host.ts";
import { createStarfield } from "./star-visuals.ts";

const BLACK_HOLE_POSITION = new Vector3(0, 0.7, 7.5);
const XR_BLACK_HOLE_STAND = new Vector3(0, 0, -10);
const COMPANION_OFFSET = new Vector3(-7.8, 2.6, 0.4);
const SHADOW_RADIUS = 2.125;

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

const hslColor = (hueDegrees: number, saturation: number, lightness: number): Color3 => {
  const hue = (((hueDegrees % 360) + 360) % 360) / 360;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = hue * 6;
  const secondary = chroma * (1 - Math.abs((section % 2) - 1));
  const [red, green, blue] =
    section < 1
      ? [chroma, secondary, 0]
      : section < 2
        ? [secondary, chroma, 0]
        : section < 3
          ? [0, chroma, secondary]
          : section < 4
            ? [0, secondary, chroma]
            : section < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  const match = lightness - chroma / 2;
  return new Color3(red + match, green + match, blue + match);
};

export interface BlackHoleWorld extends MountedWorld {}

interface BlackHoleWorldOptions {
  blackHole: BlackHoleProfile;
  onFirstFrame: () => void;
}

export const createBlackHoleWorld = (
  host: SceneHost,
  { blackHole, onFirstFrame }: BlackHoleWorldOptions,
): BlackHoleWorld => {
  const { camera, canvas, engine, profile, scene } = host;
  const activity = blackHole.visual.diskActivity;
  const hue = blackHole.visual.diskHueDegrees;

  scene.clearColor = new Color4(0.000_3, 0.000_2, 0.001_2, 1);
  camera.setTarget(BLACK_HOLE_POSITION.clone());
  camera.lowerRadiusLimit = 11;
  camera.upperRadiusLimit = 30;
  camera.lowerBetaLimit = 0.55;
  camera.upperBetaLimit = Math.PI - 0.55;
  camera.alpha = -Math.PI / 2;
  camera.beta = Math.PI / 2.18;
  camera.radius = 17.5;
  if (!host.isInXr()) camera.attachControl(canvas, true);

  const starfield = createStarfield({
    count: profile.starCount,
    scene,
    seed: blackHole.visual.seed,
  });

  const system = new TransformNode("black-hole-system", scene);
  system.position.copyFrom(BLACK_HOLE_POSITION);
  system.rotation.x = radians(57 + blackHole.visual.diskTiltDegrees * 0.22);
  system.rotation.z = radians(blackHole.visual.diskTiltDegrees);

  const schwarzschildRadius = SHADOW_RADIUS / SHADOW_TO_SCHWARZSCHILD;
  const companionDiameter = blackHole.name === "Cygnus X-1" ? 1.7 : 1.05;
  const companionPosition = BLACK_HOLE_POSITION.add(COMPANION_OFFSET);
  const companionColor =
    blackHole.name === "Cygnus X-1" ? new Color3(0.56, 0.72, 1) : new Color3(1, 0.82, 0.52);

  const lensing = MeshBuilder.CreateSphere(
    "event-horizon-lensing",
    {
      diameter: LENSING_BOUND_RADII * 2,
      segments: 24,
      sideOrientation: Mesh.BACKSIDE,
    },
    scene,
  );
  lensing.parent = system;
  lensing.rotation.x = Math.PI / 2;
  lensing.scaling.setAll(schwarzschildRadius);
  lensing.isPickable = false;
  const lensingMaterial = createLensingMaterial(scene, {
    activity,
    companion: blackHole.observation.companion
      ? { color: companionColor, position: companionPosition, radius: companionDiameter / 2 }
      : null,
    diskColor: hslColor(hue, 0.88, 0.58),
    jetColor: hslColor(hue + 175, 0.7, 0.72),
    jetStrength: blackHole.visual.jetStrength,
    profile,
    schwarzschildRadius,
    seed: blackHole.visual.seed,
  });
  lensing.material = lensingMaterial;

  let elapsed = 0;
  const renderObserver = scene.onBeforeRenderObservable.add(() => {
    const delta = Math.min(engine.getDeltaTime() / 1_000, 0.05);
    elapsed += delta;
    system.rotation.z =
      radians(blackHole.visual.diskTiltDegrees) + Math.sin(elapsed * 0.14) * 0.008 * activity;
    if (!host.prefersReducedMotion()) lensingMaterial.setFloat("time", elapsed);
    const activeCameraPosition = scene.activeCamera?.globalPosition ?? camera.globalPosition;
    starfield.update(elapsed, activeCameraPosition);
  });
  const firstFrameObserver = scene.onAfterRenderObservable.addOnce(onFirstFrame);

  const placeXrCamera = (initial: boolean): void => {
    const rig = host.xrCamera();
    if (!rig) return;
    const headOffset = initial ? 0 : rig.realWorldHeight;
    rig.position.set(
      XR_BLACK_HOLE_STAND.x,
      XR_BLACK_HOLE_STAND.y + headOffset,
      XR_BLACK_HOLE_STAND.z,
    );
    rig.setTarget(BLACK_HOLE_POSITION);
  };

  return {
    focusXrRig: placeXrCamera,
    restoreDesktopView: () => camera.attachControl(canvas, true),
    dispose: () => {
      scene.onBeforeRenderObservable.remove(renderObserver);
      scene.onAfterRenderObservable.remove(firstFrameObserver);
    },
  };
};
