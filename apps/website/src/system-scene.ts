/**
 * A host system as a place, rather than as a list of sibling worlds.
 *
 * Every other destination in Exora is one object. This one is the space between them: the host
 * star at the centre, each confirmed planet on the orbit the archive actually measured for it,
 * turning at its own measured period. The diorama is centred at roughly standing eye height, so
 * inside a headset the orbital plane runs through the room and the outer worlds pass by at head
 * level — which is the whole point of drawing a system rather than tabulating one.
 *
 * Two things had to be compressed to fit a system into a room, and both are compressed here by
 * `system-layout.ts` and printed by the interface rather than left to look linear: orbit radii,
 * which span decades within a single host, and body radii, which are four to five orders of
 * magnitude smaller than the orbits they sit on. Nothing else is invented. A planet whose shape
 * or plane the archive never solved for is drawn circular and coplanar *and says so*, in the
 * readout and in the console, and a planet the archive places nowhere at all is not placed.
 *
 * On the render budget: the bodies are deliberately coarse spheres lit by one point light, at
 * `profile.systemBodySegments`, because a dozen of them are on screen at once and each covers a
 * few dozen pixels. Full detail — the displaced terrain, the band shaders, the cloud shells —
 * arrives when a world becomes the subject of its own scene, which is what selecting one here
 * does. The host star is the exception: it is a single mesh and is drawn resolved, since a
 * system with a flat disc at the middle of it would be a diagram rather than a place.
 *
 * Built synchronously like the other destinations, so `world-scope.ts` can tell exactly what it
 * added to a scene it does not own.
 */

import { ActionManager } from "@babylonjs/core/Actions/actionManager.js";
import { ExecuteCodeAction } from "@babylonjs/core/Actions/directActions.js";
import "@babylonjs/core/Culling/ray.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import "@babylonjs/core/Meshes/instancedMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import {
  deriveHostStar,
  deriveWorldRecipe,
  hashObjectId,
  type CustomStar,
  type CustomWorld,
  type Rgb,
  type WorldRecipe,
} from "@exora/worldgen";
import type { RenderQualityProfile } from "./render-quality.ts";
import type { MountedWorld, SceneHost, WorldConsole } from "./scene-host.ts";
import { skyViewpointFrom } from "./sky-catalog.ts";
import { tuneSolarWorldRecipe } from "./solar-system.ts";
import { createStellarSurface } from "./star-surface.ts";
import { createStarfield } from "./star-visuals.ts";
import {
  deriveSystemLayout,
  mapDistance,
  orbitRadiusAu,
  orbitStateAt,
  orbitSummary,
  type DistanceMapping,
  type OrbitElements,
  type PlacedOrbit,
  type SystemLayout,
} from "./system-layout.ts";
import { systemFacts } from "./xr-console-model.ts";
import type { XrCell } from "./xr-panel-layout.ts";

/**
 * Where the middle of the diorama sits above the floor.
 *
 * Roughly a standing wearer's eye height, so the orbital plane runs through the room at the
 * height they are already looking, and walking into the system means walking among the orbits
 * rather than looking down at a table.
 */
const SYSTEM_CENTRE = new Vector3(0, 1.4, 0);
/** Where a session opens: on the floor, just outside the widest orbit, facing the star. */
const XR_SYSTEM_STAND = new Vector3(0, 0, -16.5);
/** Half-width of the square cross-section each orbit is drawn as, in scene units. */
const ORBIT_THICKNESS = 0.011;

export interface SystemWorldOptions {
  hostName: string;
  onFirstFrame: () => void;
  /** Immersive-only travel, so a wearer can leave for anywhere without removing the headset. */
  onForgeStar?: (star: CustomStar) => void;
  onForgeWorld?: (world: CustomWorld) => void;
  /** Travel to the star at the centre of this diorama. */
  onSelectHostStar?: () => void;
  /** Travel to a planet chosen from the console's own catalog, which can be anywhere. */
  onSelectPlanet?: (planet: ExoplanetProfile) => void;
  onSelectStar?: (star: StarProfile) => void;
  /** Travel to one of this system's own worlds, by pointing at it or picking it off the console. */
  onSelectWorld?: (planet: ExoplanetProfile) => void;
  planets: readonly ExoplanetProfile[];
}

export interface SystemWorld extends MountedWorld {
  /** The layout the diorama was drawn from, so the interface can print what was compressed. */
  layout: SystemLayout;
}

const toColor3 = ([red, green, blue]: Rgb): Color3 => new Color3(red, green, blue);

/**
 * One colour standing in for a whole world, at the size a diorama draws it.
 *
 * INFERRED, like every other appearance in Exora: it comes from the same worldgen recipe the
 * full-detail renderer uses, collapsed to the tint that recipe would average out to. Reusing the
 * recipe rather than picking a colour per planet kind is what keeps a world recognisable — the
 * ochre giant in the diorama is the ochre giant you arrive at.
 */
const dioramaBodyColor = (recipe: WorldRecipe): Color3 => {
  if (recipe.renderer === "rocky") {
    const ground = Color3.Lerp(
      toColor3(recipe.surface.lowColor),
      toColor3(recipe.surface.highColor),
      0.45,
    );
    const withOcean = Color3.Lerp(
      ground,
      toColor3(recipe.surface.waterColor),
      Math.min(0.75, recipe.surface.waterLevel),
    );
    return Color3.Lerp(
      withOcean,
      toColor3(recipe.surface.cloudColor),
      recipe.surface.cloudCover * 0.35,
    );
  }

  if (recipe.renderer === "ice-giant") {
    return Color3.Lerp(
      toColor3(recipe.atmosphereBands.deepColor),
      toColor3(recipe.atmosphereBands.lightColor),
      0.55,
    );
  }

  return Color3.Lerp(
    toColor3(recipe.cloudBands.midColor),
    toColor3(recipe.cloudBands.lightColor),
    0.4,
  );
};

/** A molten world is the one kind that emits rather than only reflects, so it keeps that here. */
const dioramaBodyGlow = (recipe: WorldRecipe): Color3 =>
  recipe.renderer === "rocky" && recipe.surface.lavaStrength > 0.05
    ? toColor3(recipe.surface.emissiveColor).scale(Math.min(0.7, recipe.surface.lavaStrength))
    : Color3.Black();

/** The closed curve one orbit traces, in its own plane, already mapped into scene units. */
const buildOrbitPath = (
  mapping: DistanceMapping,
  elements: OrbitElements,
  segments: number,
): Vector3[] => {
  const points: Vector3[] = [];
  for (let index = 0; index < segments; index += 1) {
    const trueAnomaly = (index / segments) * Math.PI * 2;
    // Every radius goes through the same mapping the semi-major axes did, so a point on the curve
    // sits at the mapped distance the planet actually has there. What that produces is not an
    // ellipse — but the star stays at the focus and perihelion stays nearer than aphelion by the
    // measured amount, which is what drawing the shape is for.
    const radius = mapDistance(
      mapping,
      orbitRadiusAu(elements.semiMajorAxisAu, elements.eccentricity, trueAnomaly),
    );
    points.push(new Vector3(Math.cos(trueAnomaly) * radius, 0, Math.sin(trueAnomaly) * radius));
  }
  return points;
};

/**
 * A closed orbit line with enough body to survive being seen edge-on.
 *
 * A flat ribbon vanishes exactly when the wearer is standing in the orbital plane, which in this
 * scene is most of the time. A four-sided tube costs four vertices per segment — a fraction of
 * what a torus would — and is visible from anywhere in the room.
 */
const buildOrbitRibbon = (scene: Scene, name: string, path: readonly Vector3[]): Mesh => {
  const count = path.length;
  const positions = new Float32Array(count * 4 * 3);
  const indices = new Uint32Array(count * 24);
  const tangent = new Vector3();
  const side = new Vector3();

  for (let index = 0; index < count; index += 1) {
    const previous = path[(index - 1 + count) % count] as Vector3;
    const next = path[(index + 1) % count] as Vector3;
    const point = path[index] as Vector3;
    next.subtractToRef(previous, tangent);
    tangent.normalize();
    // The curve is planar in XZ, so the in-plane normal is the tangent turned a quarter turn.
    side.set(-tangent.z, 0, tangent.x);

    const corners = [
      [side.x, 1, side.z],
      [side.x, -1, side.z],
      [-side.x, -1, -side.z],
      [-side.x, 1, -side.z],
    ] as const;
    for (let corner = 0; corner < 4; corner += 1) {
      const offset = corners[corner] as readonly [number, number, number];
      const vertex = (index * 4 + corner) * 3;
      positions[vertex] = point.x + offset[0] * ORBIT_THICKNESS;
      positions[vertex + 1] = point.y + offset[1] * ORBIT_THICKNESS;
      positions[vertex + 2] = point.z + offset[2] * ORBIT_THICKNESS;
    }

    const ring = index * 4;
    const nextRing = ((index + 1) % count) * 4;
    for (let corner = 0; corner < 4; corner += 1) {
      const near = corner;
      const far = (corner + 1) % 4;
      const face = (index * 4 + corner) * 6;
      indices[face] = ring + near;
      indices[face + 1] = ring + far;
      indices[face + 2] = nextRing + far;
      indices[face + 3] = ring + near;
      indices[face + 4] = nextRing + far;
      indices[face + 5] = nextRing + near;
    }
  }

  const normals = new Float32Array(positions.length);
  VertexData.ComputeNormals(positions, indices, normals);

  const mesh = new Mesh(name, scene);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.applyToMesh(mesh, false);
  mesh.isPickable = false;
  mesh.applyFog = false;
  return mesh;
};

interface DrawnWorld {
  body: Mesh;
  orbit: PlacedOrbit;
  plane: TransformNode;
}

const buildWorld = (
  scene: Scene,
  profile: RenderQualityProfile,
  layout: SystemLayout,
  orbit: PlacedOrbit,
  root: TransformNode,
  onSelect: (planet: ExoplanetProfile) => void,
): DrawnWorld => {
  const { planet } = orbit;
  const recipe = tuneSolarWorldRecipe(planet, deriveWorldRecipe(planet));
  const color = dioramaBodyColor(recipe);

  const plane = new TransformNode(`diorama-plane-${planet.id}`, scene);
  plane.parent = root;
  plane.rotation.x = orbit.tiltRadians;

  const ribbon = buildOrbitRibbon(
    scene,
    `diorama-orbit-${planet.id}`,
    buildOrbitPath(layout.mapping, orbit.elements, profile.systemOrbitSegments),
  );
  ribbon.parent = plane;
  const ribbonMaterial = new StandardMaterial(`diorama-orbit-material-${planet.id}`, scene);
  ribbonMaterial.disableLighting = true;
  ribbonMaterial.emissiveColor = Color3.Lerp(color, new Color3(0.42, 0.68, 0.78), 0.55);
  ribbonMaterial.alpha = 0.42;
  // Depth is still tested, so an orbit passing behind the star is correctly hidden by it; only
  // the write is dropped, so orbits crossing each other blend instead of z-fighting.
  ribbonMaterial.disableDepthWrite = true;
  ribbonMaterial.backFaceCulling = false;
  ribbonMaterial.freeze();
  ribbon.material = ribbonMaterial;

  const body = MeshBuilder.CreateSphere(
    `diorama-world-${planet.id}`,
    { diameter: orbit.bodyRadiusSceneUnits * 2, segments: profile.systemBodySegments },
    scene,
  );
  body.parent = plane;
  body.applyFog = false;
  body.isPickable = true;
  const bodyMaterial = new StandardMaterial(`diorama-world-material-${planet.id}`, scene);
  bodyMaterial.diffuseColor = color;
  // A lit sphere with a specular highlight reads as a billiard ball; a planet does not have one.
  bodyMaterial.specularColor = Color3.Black();
  // Enough that the night side is a silhouette rather than a hole in the starfield, and no more:
  // the terminator is the only thing telling a viewer which way the star is from here.
  bodyMaterial.ambientColor = Color3.Black();
  bodyMaterial.emissiveColor = color.scale(0.055).add(dioramaBodyGlow(recipe));
  bodyMaterial.freeze();
  body.material = bodyMaterial;

  // The bodies are small on purpose, and a controller ray has to be able to find one anyway.
  const pickTarget = MeshBuilder.CreateSphere(
    `diorama-world-target-${planet.id}`,
    { diameter: Math.max(0.62, orbit.bodyRadiusSceneUnits * 4.4), segments: 10 },
    scene,
  );
  pickTarget.parent = body;
  pickTarget.applyFog = false;
  pickTarget.isPickable = true;
  const targetMaterial = new StandardMaterial(`diorama-world-target-material-${planet.id}`, scene);
  targetMaterial.disableLighting = true;
  targetMaterial.emissiveColor = color;
  targetMaterial.alpha = 0.05;
  targetMaterial.disableDepthWrite = true;
  targetMaterial.freeze();
  pickTarget.material = targetMaterial;

  for (const target of [body, pickTarget]) {
    const manager = new ActionManager(scene);
    manager.registerAction(
      new ExecuteCodeAction(ActionManager.OnPickTrigger, () => onSelect(planet)),
    );
    target.actionManager = manager;
  }

  return { body, orbit, plane };
};

export const createSystemWorld = (
  host: SceneHost,
  {
    hostName,
    onFirstFrame,
    onForgeStar,
    onForgeWorld,
    onSelectHostStar,
    onSelectPlanet,
    onSelectStar,
    onSelectWorld,
    planets,
  }: SystemWorldOptions,
): SystemWorld => {
  const { camera, canvas, engine, profile, scene } = host;
  const layout = deriveSystemLayout(planets);
  const primary = planets[0];

  scene.clearColor = new Color4(0.001, 0.002, 0.006, 1);
  // Group 1 holds the star's corona and glare. Keeping group 0's depth lets a planet in front of
  // the star occlude them, instead of the halo painting over every world it passes behind.
  scene.setRenderingAutoClearDepthStencil(1, false, true, true);

  const outerReach = Math.max(
    layout.mapping.outerSceneUnits,
    ...layout.orbits.map((orbit) => orbit.semiMajorAxisSceneUnits),
  );
  // The target moves first, and everything else after it. `setTarget` rebuilds alpha, beta and
  // radius from wherever the camera was left standing by the previous destination, so angles
  // assigned before it are silently thrown away — which lands a diorama exactly edge-on, as a
  // flat line, depending only on where the visitor happened to travel from.
  camera.setTarget(SYSTEM_CENTRE.clone());
  camera.lowerRadiusLimit = 3.5;
  camera.upperRadiusLimit = outerReach * 3.6;
  camera.lowerBetaLimit = 0.16;
  camera.upperBetaLimit = Math.PI - 0.16;
  camera.alpha = -Math.PI / 2;
  // Well above the plane, because a system seen edge-on is a line. Low enough that the orbits
  // still read as rings in perspective rather than as a flat chart.
  camera.beta = 1.02;
  camera.radius = outerReach * 1.9;
  if (!host.isInXr()) camera.attachControl(canvas, true);

  const root = new TransformNode("diorama-root", scene);
  root.position.copyFrom(SYSTEM_CENTRE);

  // Every planet of a host shares its sky, so the diorama gets the real one: this is the view out
  // of this system, with the near stars swung out of the places Earth sees them in.
  const starfield = createStarfield({
    count: profile.starCount,
    scene,
    seed: hashObjectId(hostName),
    viewpoint: primary ? skyViewpointFrom(primary.observation) : null,
  });

  // The host star's own physical parameters come from the NASA row every planet here carries, so
  // the centre of the diorama is the measured star rather than a stand-in — and it needs no
  // SIMBAD resolution, which is what lets a system be visited even when its name is not in SIMBAD.
  const starRecipe = primary ? deriveHostStar(primary) : null;
  const stellarSurface = starRecipe
    ? createStellarSurface({
        detail: "subject",
        diameter: layout.hostRadiusSceneUnits * 2,
        pickable: Boolean(onSelectHostStar),
        position: SYSTEM_CENTRE,
        profile,
        recipe: starRecipe,
        scene,
        seed: hashObjectId(hostName),
        spotCoverage: starRecipe.spotCoverage,
      })
    : null;

  if (stellarSurface && onSelectHostStar) {
    for (const target of stellarSurface.meshes) {
      target.actionManager = new ActionManager(scene);
      target.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPickTrigger, onSelectHostStar),
      );
    }
  }

  /**
   * One light for the whole system, at the star, which is exactly where a planetary system's
   * light comes from. Babylon's standard falloff is linear to `range`, and the default range is
   * effectively infinite, so this lights every body from the centre without an inverse-square
   * term — which would be meaningless here anyway, since the distances it would fall off over
   * are logarithmically compressed rather than real.
   */
  const starLight = new PointLight("diorama-star-light", SYSTEM_CENTRE.clone(), scene);
  starLight.diffuse = starRecipe ? toColor3(starRecipe.color) : Color3.White();
  starLight.specular = Color3.Black();
  starLight.intensity = 1.45;

  const drawn: DrawnWorld[] = layout.orbits.map((orbit) =>
    buildWorld(scene, profile, layout, orbit, root, (planet) => onSelectWorld?.(planet)),
  );

  // Placed once at the phase they start from, so the very first frame already shows a system
  // rather than every world stacked along one radius waiting for the render loop.
  const applyPositions = (elapsedSeconds: number): void => {
    for (const world of drawn) {
      const state = orbitStateAt(world.orbit, elapsedSeconds, layout.daysPerSecond);
      const radius = mapDistance(layout.mapping, state.radiusAu);
      world.body.position.set(
        Math.cos(state.trueAnomaly) * radius,
        0,
        Math.sin(state.trueAnomaly) * radius,
      );
    }
  };
  applyPositions(0);

  let elapsed = 0;
  const renderObserver = scene.onBeforeRenderObservable.add(() => {
    elapsed += Math.min(engine.getDeltaTime() / 1_000, 0.05);
    const eye = scene.activeCamera?.globalPosition ?? camera.globalPosition;
    stellarSurface?.update(elapsed, eye);
    starfield.update(elapsed, eye);
    applyPositions(elapsed);
  });

  const firstFrameObserver = scene.onAfterRenderObservable.addOnce(onFirstFrame);

  /** Puts the wearer on the floor outside the widest orbit, facing the star at the centre. */
  const placeXrCamera = (initial: boolean): void => {
    const rig = host.xrCamera();
    if (!rig) return;
    const headOffset = initial ? 0 : rig.realWorldHeight;
    const standoff = Math.max(XR_SYSTEM_STAND.z, -(outerReach + 3.5));
    rig.position.set(XR_SYSTEM_STAND.x, XR_SYSTEM_STAND.y + headOffset, standoff);
    rig.setTarget(SYSTEM_CENTRE);
  };

  const buildSceneActions = (): XrCell[] => {
    const actions: XrCell[] = [
      {
        detail: "Stand outside the widest orbit",
        id: "recentre",
        label: "Recentre me",
        onSelect: () => placeXrCamera(false),
      },
    ];

    if (onSelectHostStar) {
      actions.push({
        detail: `Visit ${hostName} itself`,
        id: "host-star",
        label: "Travel to the host star",
        onSelect: onSelectHostStar,
      });
    }

    const travel = onSelectWorld;
    if (travel) {
      for (const orbit of layout.orbits.slice(0, 5)) {
        actions.push({
          badge: orbit.planet.kind === "unknown" ? undefined : orbit.planet.kind.replace("-", " "),
          detail: orbitSummary(orbit),
          id: `world-${orbit.planet.id}`,
          label: orbit.planet.name,
          onSelect: () => travel(orbit.planet),
        });
      }
    }

    return actions;
  };

  const consoleContributions: WorldConsole = {
    facts: () => systemFacts(hostName, layout),
    onForgePlanet: onForgeWorld,
    onForgeStar,
    onTravelPlanet: onSelectPlanet,
    onTravelStar: onSelectStar,
    sceneActions: buildSceneActions,
    source: () =>
      primary
        ? `${primary.source.archive} · ${primary.source.retrievedOn}`
        : "NASA Exoplanet Archive",
    subtitle: () =>
      `system diorama · ${layout.orbits.length} orbit${layout.orbits.length === 1 ? "" : "s"} drawn`,
    summary: () =>
      `The ${hostName} system, drawn from its measured orbits. Radii and body sizes are compressed to fit a room — ${
        layout.orbits.length
      } world${layout.orbits.length === 1 ? "" : "s"} on a logarithmic radial scale, turning at their real relative periods.`,
    title: () => `${hostName} system`,
  };

  return {
    console: consoleContributions,
    focusXrRig: placeXrCamera,
    layout,
    restoreDesktopView: () => camera.attachControl(canvas, true),
    // Meshes, materials, action managers and the point light all belong to the world scope the
    // host opened around this build. What is left here is what lives outside the scene graph.
    dispose: () => {
      scene.onBeforeRenderObservable.remove(renderObserver);
      scene.onAfterRenderObservable.remove(firstFrameObserver);
    },
  };
};
