import { ActionManager } from "@babylonjs/core/Actions/actionManager.js";
import "@babylonjs/core/Culling/ray.js";
import { ExecuteCodeAction } from "@babylonjs/core/Actions/directActions.js";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
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
/** Initial immersive viewpoint, parked outside the widest planetary orbit in the system. */
const XR_STAR_STAND = new Vector3(0, 0, -9);

export interface StarWorld extends MountedWorld {
  setPlanetTargets: (
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
 * Like the planet world, everything here is built synchronously so the host's world scope can
 * tell precisely what was added. The system's known worlds arrive later over the network, so
 * those orbits are the one part this module has to take back out itself.
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

  camera.lowerRadiusLimit = 9.5;
  camera.upperRadiusLimit = 24;
  camera.lowerBetaLimit = 0.45;
  camera.upperBetaLimit = Math.PI - 0.45;
  camera.alpha = -Math.PI / 2;
  camera.beta = Math.PI / 2.08;
  camera.radius = 15.5;
  camera.setTarget(STAR_POSITION.clone());
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

  let planetTargetRoots: TransformNode[] = [];
  let planetTargetManagers: ActionManager[] = [];
  let menuPlanets: readonly ExoplanetProfile[] = [];
  let selectPlanet: ((planet: ExoplanetProfile) => void) | null = null;

  /**
   * The system's known worlds, drawn as orbits around the star.
   *
   * These land after the host's world scope has closed, because the archive query that finds
   * them is a network round trip, so this is the one part of the star world that has to be
   * disposed by hand rather than swept up with the rest.
   */
  const clearPlanetTargets = (): void => {
    for (const manager of planetTargetManagers) manager.dispose();
    for (const root of planetTargetRoots) root.dispose(false, true);
    planetTargetManagers = [];
    planetTargetRoots = [];
  };

  const setPlanetTargets = (
    planets: readonly ExoplanetProfile[],
    onSelect: (planet: ExoplanetProfile) => void,
  ): void => {
    menuPlanets = planets;
    selectPlanet = onSelect;
    host.refreshConsole();
    clearPlanetTargets();
    planetTargetRoots = planets.slice(0, 8).map((planet, index) => {
      const root = new TransformNode(`system-world-orbit-${planet.id}`, scene);
      root.position.copyFrom(starMesh.position);
      root.rotation.x = -0.08 + (index % 3) * 0.07;
      root.rotation.z = ((index % 2 === 0 ? -1 : 1) * Math.PI) / 34;

      const orbitRadius = diameter * 0.68 + 1.1 + index * 0.48;
      const orbit = MeshBuilder.CreateTorus(
        `system-world-guide-${planet.id}`,
        { diameter: orbitRadius * 2, thickness: 0.012, tessellation: 96 },
        scene,
      );
      orbit.parent = root;
      orbit.isPickable = false;
      const orbitMaterial = new StandardMaterial(`system-world-guide-material-${planet.id}`, scene);
      orbitMaterial.disableLighting = true;
      orbitMaterial.emissiveColor = new Color3(0.24, 0.48, 0.52);
      orbitMaterial.alpha = 0.22;
      orbitMaterial.disableDepthWrite = true;
      orbit.material = orbitMaterial;

      const world = MeshBuilder.CreateSphere(
        `system-world-${planet.id}`,
        { diameter: planet.kind === "gas-giant" ? 0.72 : 0.5, segments: 24 },
        scene,
      );
      world.parent = root;
      world.position.x = orbitRadius;
      world.isPickable = true;
      const worldMaterial = new StandardMaterial(`system-world-material-${planet.id}`, scene);
      worldMaterial.disableLighting = true;
      const worldColor =
        planet.kind === "gas-giant"
          ? new Color3(0.9, 0.58, 0.3)
          : planet.kind === "ice-giant"
            ? new Color3(0.34, 0.72, 0.92)
            : new Color3(0.36, 0.82, 0.7);
      worldMaterial.diffuseColor = worldColor;
      worldMaterial.emissiveColor = worldColor.scale(0.45);
      world.material = worldMaterial;

      const pointerTarget = MeshBuilder.CreateSphere(
        `system-world-pointer-${planet.id}`,
        { diameter: 1.05, segments: 16 },
        scene,
      );
      pointerTarget.parent = root;
      pointerTarget.position.copyFrom(world.position);
      pointerTarget.isPickable = true;
      const pointerMaterial = new StandardMaterial(
        `system-world-pointer-material-${planet.id}`,
        scene,
      );
      pointerMaterial.disableLighting = true;
      pointerMaterial.emissiveColor = worldColor;
      pointerMaterial.alpha = 0.055;
      pointerMaterial.disableDepthWrite = true;
      pointerTarget.material = pointerMaterial;

      for (const target of [world, pointerTarget]) {
        const manager = new ActionManager(scene);
        manager.registerAction(
          new ExecuteCodeAction(ActionManager.OnPickTrigger, () => selectPlanet?.(planet)),
        );
        target.actionManager = manager;
        planetTargetManagers.push(manager);
      }
      root.rotation.y = (index / Math.max(1, planets.length)) * Math.PI * 2;
      return root;
    });
  };

  let elapsed = 0;
  const renderObserver = scene.onBeforeRenderObservable.add(() => {
    const deltaSeconds = Math.min(engine.getDeltaTime() / 1_000, 0.05);
    elapsed += deltaSeconds;
    const activeCameraPosition = scene.activeCamera?.globalPosition ?? camera.globalPosition;
    stellarSurface.update(elapsed, activeCameraPosition);
    starfield.update(elapsed, activeCameraPosition);
    for (let index = 0; index < planetTargetRoots.length; index += 1) {
      const root = planetTargetRoots[index];
      if (root) root.rotation.y += (0.025 + index * 0.004) * deltaSeconds;
    }
  });

  const firstFrameObserver = scene.onAfterRenderObservable.addOnce(onFirstFrame);

  /**
   * Puts the wearer at the initial orbital viewpoint facing the star.
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
    setPlanetTargets,
    focusXrRig: placeXrCamera,
    restoreDesktopView: () => camera.attachControl(canvas, true),
    dispose: () => {
      scene.onBeforeRenderObservable.remove(renderObserver);
      scene.onAfterRenderObservable.remove(firstFrameObserver);
      clearPlanetTargets();
      // The glow layer owns render targets rather than scene nodes, so the world scope that
      // sweeps up the meshes cannot see it.
      glow.dispose();
    },
  };
};
