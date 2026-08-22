import { GlowLayer } from "@babylonjs/core/Layers/glowLayer.js";
import { Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import { deriveStarRecipe, type CustomStar, type CustomWorld } from "@exora/worldgen";
import type { MountedWorld, SceneHost, WorldConsole } from "./scene-host.ts";
import { createStellarSurface } from "./star-surface.ts";
import { skyViewpointFrom } from "./sky-catalog.ts";
import { starKindLabel, starSummary } from "./star-utils.ts";
import { createStarfield } from "./star-visuals.ts";
import { starFacts } from "./xr-console-model.ts";
import type { XrCell } from "./xr-panel-layout.ts";

const STAR_POSITION = new Vector3(0, 0.8, 7.5);
/** Initial immersive viewpoint, far enough out that the star reads as a body rather than a wall. */
const XR_STAR_STAND = new Vector3(0, 0, -9);

export interface StarWorld extends MountedWorld {
  /**
   * Hands this view the worlds the archive links to the star, once it has answered.
   *
   * They become console entries, not scene objects: somewhere a wearer can travel to without
   * taking the headset off. Nothing is drawn for them here — see the note above `createStarWorld`.
   */
  setSystemWorlds: (
    planets: readonly ExoplanetProfile[],
    onSelectPlanet: (planet: ExoplanetProfile) => void,
  ) => void;
}

interface StarWorldOptions {
  onFirstFrame: () => void;
  /** Immersive-only travel, so a wearer can leave for anywhere without removing the headset. */
  onForgeStar?: (star: CustomStar) => void;
  onForgeWorld?: (world: CustomWorld) => void;
  onSelectPlanet?: (planet: ExoplanetProfile) => void;
  onSelectStar?: (star: StarProfile) => void;
  /** Pull back to the whole host system this star sits at the middle of. */
  onSelectSystem?: () => void;
  star: StarProfile;
}

/**
 * Builds a star into the shared scene.
 *
 * What this scene deliberately does not draw is the star's planets. It used to: one ring per
 * known world, spaced by the world's position in the list, tilted by that position modulo three,
 * given one of two body sizes by planet kind, and turned at a rate picked the same way. None of
 * that came from the archive — not the spacing, not the tilts, not the sizes, not the speeds —
 * and nothing on screen said so, which made a diagram of nothing look like a measurement.
 *
 * The measured orbits do exist, and are drawn: `system-scene.ts` places every world of a host on
 * the semi-major axis, eccentricity, inclination and period the archive reports for it, through
 * the stated mapping in `system-layout.ts`. "View the whole system" on the console here, and the
 * matching entry on the page, are the route there. So this view is about the star — its
 * photosphere, its corona, and the real sky seen from where it stands — and its system reaches a
 * visitor as a list of places to go rather than as invented geometry.
 *
 * Like the planet world, everything here is built synchronously so the host's world scope can
 * tell precisely what was added. The system's known worlds arrive later over the network, but
 * they add nothing to the scene, so there is nothing left for this module to take back out by
 * hand beyond the glow layer, which lives outside the scene graph.
 */
export const createStarWorld = (
  host: SceneHost,
  {
    onFirstFrame,
    onForgeStar,
    onForgeWorld,
    onSelectPlanet,
    onSelectStar,
    onSelectSystem,
    star,
  }: StarWorldOptions,
): StarWorld => {
  const { camera, canvas, engine, profile, scene } = host;

  scene.clearColor = new Color4(0.001, 0.002, 0.006, 1);

  // The target moves first, and everything else after it. `setTarget` rebuilds alpha, beta and
  // radius from wherever the camera was left standing by the previous destination, so angles and
  // distances assigned before it are silently thrown away — which framed an arriving star from
  // the last world's viewpoint rather than from its own.
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

  // SIMBAD gives this star a right ascension, a declination and a parallax, which is everything
  // needed to stand at it and look out: the background is then the real sky from there, with the
  // near stars swung out of the places Earth sees them in. A star with any of the three missing —
  // and every World Forge star — falls back to the seeded field inside `createStarfield`.
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

  // Kept modest, and the corona shell rides along in the same bloom pass — without it the shell
  // reads as a flat, hard-edged translucent disc rather than a soft glow.
  const glow = new GlowLayer("stellar-glow", scene, {
    blurKernelSize: profile.tier === "desktop" ? 40 : 20,
    mainTextureFixedSize: profile.tier === "desktop" ? 512 : 256,
  });
  glow.intensity = 0.75 + activity * 0.35;
  glow.addIncludedOnlyMesh(starMesh);

  let menuPlanets: readonly ExoplanetProfile[] = [];
  let selectPlanet: ((planet: ExoplanetProfile) => void) | null = null;

  const setSystemWorlds = (
    planets: readonly ExoplanetProfile[],
    onSelect: (planet: ExoplanetProfile) => void,
  ): void => {
    menuPlanets = planets;
    selectPlanet = onSelect;
    // The archive answers after the console has already been painted from an empty system, so the
    // panel has to be told to repaint rather than waiting for the wearer to reopen it.
    host.refreshConsole();
  };

  let elapsed = 0;
  const renderObserver = scene.onBeforeRenderObservable.add(() => {
    elapsed += Math.min(engine.getDeltaTime() / 1_000, 0.05);
    const activeCameraPosition = scene.activeCamera?.globalPosition ?? camera.globalPosition;
    stellarSurface.update(elapsed, activeCameraPosition);
    starfield.update(elapsed, activeCameraPosition);
  });

  const firstFrameObserver = scene.onAfterRenderObservable.addOnce(onFirstFrame);

  /**
   * Puts the wearer at the initial viewpoint facing the star.
   *
   * The rig otherwise starts wherever the headset happened to be pointing, which in a scene this
   * sparse means staring at empty starfield with no clue that anything rendered at all.
   */
  const placeXrCamera = (initial: boolean): void => {
    const rig = host.xrCamera();
    if (!rig) return;
    const headOffset = initial ? 0 : rig.realWorldHeight;
    rig.position.set(XR_STAR_STAND.x, XR_STAR_STAND.y + headOffset, XR_STAR_STAND.z);
    rig.setTarget(STAR_POSITION);
  };

  const buildSceneActions = (): XrCell[] => {
    const actions: XrCell[] = [
      {
        detail: "Face the star",
        id: "recentre",
        label: "Recentre me",
        onSelect: () => placeXrCamera(false),
      },
    ];

    if (onSelectSystem) {
      actions.push({
        detail: "Stand among the measured orbits",
        id: "host-system",
        label: "View the whole system",
        onSelect: onSelectSystem,
      });
    }

    const travel = selectPlanet;
    if (travel) {
      for (const planet of menuPlanets.slice(0, 5)) {
        actions.push({
          badge: planet.kind === "unknown" ? undefined : planet.kind.replace("-", " "),
          detail: "Travel to this world",
          id: `planet-${planet.id}`,
          label: planet.name,
          onSelect: () => travel(planet),
        });
      }
    }

    return actions;
  };

  const consoleContributions: WorldConsole = {
    facts: () => starFacts(star),
    onForgePlanet: onForgeWorld,
    onForgeStar,
    onTravelPlanet: onSelectPlanet,
    onTravelStar: onSelectStar,
    sceneActions: buildSceneActions,
    source: () => `${star.source.archive} · ${star.source.retrievedOn}`,
    subtitle: () => `${starKindLabel(star)} · orbital view`,
    summary: () => starSummary(star),
    title: () => star.name,
  };

  return {
    console: consoleContributions,
    setSystemWorlds,
    focusXrRig: placeXrCamera,
    restoreDesktopView: () => camera.attachControl(canvas, true),
    dispose: () => {
      scene.onBeforeRenderObservable.remove(renderObserver);
      scene.onAfterRenderObservable.remove(firstFrameObserver);
      // The glow layer owns render targets rather than scene nodes, so the world scope that
      // sweeps up the meshes cannot see it.
      glow.dispose();
    },
  };
};
