import { Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AsteroidProfile } from "./solar-asteroids.ts";
import { asteroidSystemMembers } from "./solar-asteroids.ts";
import { createIrregularBody } from "./irregular-body.ts";
import type { MountedWorld, SceneHost, WorldConsole } from "./scene-host.ts";
import { createStarfield } from "./star-visuals.ts";
import type { XrCell } from "./xr-panel-layout.ts";

export interface SmallBodyWorldOptions {
  asteroid: AsteroidProfile;
  onFirstFrame: () => void;
  onSelectAsteroid: (asteroid: AsteroidProfile) => void;
}

export const createSmallBodyWorld = async (
  host: SceneHost,
  { asteroid, onFirstFrame, onSelectAsteroid }: SmallBodyWorldOptions,
): Promise<MountedWorld> => {
  const { camera, canvas, engine, profile, scene } = host;
  scene.clearColor = new Color4(0.001, 0.002, 0.006, 1);

  const body = await createIrregularBody(scene, asteroid.descriptor, profile);
  camera.setTarget(Vector3.Zero());
  camera.lowerRadiusLimit = body.camera.lowerRadiusLimit;
  camera.upperRadiusLimit = body.camera.upperRadiusLimit;
  camera.lowerBetaLimit = 0.18;
  camera.upperBetaLimit = Math.PI - 0.18;
  camera.alpha = -Math.PI / 2.35;
  camera.beta = Math.PI / 2.25;
  camera.radius = body.camera.initialRadius;
  if (!host.isInXr()) camera.attachControl(canvas, true);

  const starfield = createStarfield({
    count: profile.starCount,
    scene,
    seed: asteroid.naifId,
    viewpoint: null,
  });

  let elapsed = 0;
  // Rotation is accelerated so it can be inspected. The UI identifies this as a simulated time
  // scale; the period and direction themselves remain the measured solution in the descriptor.
  const renderObserver = scene.onBeforeRenderObservable.add(() => {
    const delta = Math.min(engine.getDeltaTime() / 1_000, 0.05);
    elapsed += delta;
    body.advanceRotation(delta, 1_200);
    const viewer = scene.activeCamera?.globalPosition ?? camera.globalPosition;
    starfield.update(elapsed, viewer);
  });
  const firstFrameObserver = scene.onAfterRenderObservable.addOnce(onFirstFrame);

  const placeXrCamera = (initial: boolean): void => {
    const rig = host.xrCamera();
    if (!rig) return;
    const headOffset = initial ? 0 : rig.realWorldHeight;
    rig.position.set(0, headOffset, -body.camera.initialRadius * 0.82);
    rig.setTarget(Vector3.Zero());
  };

  const sceneActions = (): XrCell[] => [
    {
      detail: "Face the measured body frame",
      id: "recentre-small-body",
      label: "Recentre me",
      onSelect: () => placeXrCamera(false),
    },
    ...asteroidSystemMembers(asteroid).map((companion) => ({
      badge: "companion",
      detail: `Direct parent: ${companion.parent}`,
      id: `asteroid-${companion.id}`,
      label: companion.name,
      onSelect: () => onSelectAsteroid(companion),
    })),
  ];

  const consoleContributions: WorldConsole = {
    facts: () => [
      { label: "SPK", value: asteroid.spkId },
      { label: "DIAMETER", value: `${asteroid.diameterKilometers.value.toLocaleString()} km` },
      {
        label: "ROTATION",
        value: asteroid.rotationHours.value ? `${asteroid.rotationHours.value} h` : "unknown",
      },
      { label: "CLASS", value: asteroid.orbit.class },
      { label: "SPECTRUM", value: asteroid.spectralType ?? "not reported" },
      {
        label: "GEOMETRY",
        value: body.geometryStatus === "measured-shape" ? "measured model" : "dimensions only",
      },
    ],
    sceneActions,
    source: () =>
      `${asteroid.source.api} ${asteroid.source.apiVersion} · ${asteroid.source.retrievedOn}`,
    subtitle: () => `${asteroid.orbit.class} · parent ${asteroid.parent}`,
    summary: () => asteroid.summary,
    title: () => asteroid.name,
  };

  return {
    console: consoleContributions,
    farthestView: () => body.camera.upperRadiusLimit,
    focusXrRig: placeXrCamera,
    restoreDesktopView: () => camera.attachControl(canvas, true),
    dispose: () => {
      scene.onBeforeRenderObservable.remove(renderObserver);
      scene.onAfterRenderObservable.remove(firstFrameObserver);
      starfield.dispose();
      body.dispose();
    },
  };
};
