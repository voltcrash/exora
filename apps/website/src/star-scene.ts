import { GlowLayer } from "@babylonjs/core/Layers/glowLayer.js";
import { Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import type { StarProfile } from "@exora/contracts";
import { deriveStarRecipe } from "@exora/worldgen";
import type { MountedWorld, SceneHost } from "./scene-host.ts";
import { createStellarSurface } from "./star-surface.ts";
import { skyViewpointFrom } from "./sky-catalog.ts";
import { createStarfield } from "./star-visuals.ts";

const STAR_POSITION = new Vector3(0, 0.8, 7.5);
const XR_STAR_STAND = new Vector3(0, 0, -9);

interface StarWorldOptions {
  onFirstFrame: () => void;
  star: StarProfile;
}

export const createStarWorld = (
  host: SceneHost,
  { onFirstFrame, star }: StarWorldOptions,
): MountedWorld => {
  const { camera, canvas, engine, profile, scene } = host;

  scene.clearColor = new Color4(0.001, 0.002, 0.006, 1);

  camera.setTarget(STAR_POSITION.clone());
  camera.lowerRadiusLimit = 9.5;
  camera.upperRadiusLimit = 24;
  camera.lowerBetaLimit = 0.45;
  camera.upperBetaLimit = Math.PI - 0.45;
  camera.alpha = -Math.PI / 2;
  camera.beta = Math.PI / 2.08;
  camera.radius = 15.5;
  if (!host.isInXr()) camera.attachControl(canvas, true);

  const recipe = deriveStarRecipe(star);
  const seed = recipe.seed;
  const activity = recipe.activity;
  const diameter = recipe.radiusSceneUnits;
  camera.lowerRadiusLimit = Math.min(9.5, diameter * 1.3 + 0.15);

  const starfield = createStarfield({
    count: profile.starCount,
    scene,
    seed,
    viewpoint: skyViewpointFrom(star.observation),
  });

  const stellarSurface = createStellarSurface({
    detail: "subject",
    diameter,
    position: STAR_POSITION,
    profile,
    recipe,
    rotationFactor: star.customization?.rotation ?? 0.35,
    scene,
    seed,
    spotCoverage: recipe.spotCoverage,
  });
  const starMesh = stellarSurface.photosphere;

  const glow = new GlowLayer("stellar-glow", scene, {
    blurKernelSize: profile.tier === "desktop" ? 40 : 20,
    mainTextureFixedSize: profile.tier === "desktop" ? 512 : 256,
  });
  glow.intensity = 0.75 + activity * 0.35;
  glow.addIncludedOnlyMesh(starMesh);

  let elapsed = 0;
  const renderObserver = scene.onBeforeRenderObservable.add(() => {
    elapsed += Math.min(engine.getDeltaTime() / 1_000, 0.05);
    const activeCameraPosition = scene.activeCamera?.globalPosition ?? camera.globalPosition;
    stellarSurface.update(elapsed, activeCameraPosition);
    starfield.update(elapsed, activeCameraPosition);
  });

  const firstFrameObserver = scene.onAfterRenderObservable.addOnce(onFirstFrame);

  const placeXrCamera = (initial: boolean): void => {
    const rig = host.xrCamera();
    if (!rig) return;
    const headOffset = initial ? 0 : rig.realWorldHeight;
    rig.position.set(XR_STAR_STAND.x, XR_STAR_STAND.y + headOffset, XR_STAR_STAND.z);
    rig.setTarget(STAR_POSITION);
  };

  return {
    focusXrRig: placeXrCamera,
    restoreDesktopView: () => camera.attachControl(canvas, true),
    dispose: () => {
      scene.onBeforeRenderObservable.remove(renderObserver);
      scene.onAfterRenderObservable.remove(firstFrameObserver);
      glow.dispose();
    },
  };
};
