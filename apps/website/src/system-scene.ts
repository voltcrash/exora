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
import type { EphemerisVector, ExoplanetProfile } from "@exora/contracts";
import {
  deriveHostStar,
  deriveWorldRecipe,
  hashObjectId,
  type Rgb,
  type WorldRecipe,
} from "@exora/worldgen";
import type { RenderQualityProfile } from "./render-quality.ts";
import type { MountedWorld, SceneHost } from "./scene-host.ts";
import { skyViewpointFrom } from "./sky-catalog.ts";
import { propagateEphemerisVector } from "./solar-ephemeris.ts";
import { tuneSolarWorldRecipe } from "./solar-system.ts";
import { createStellarSurface, makeStarTravelTarget } from "./star-surface.ts";
import { createStarfield } from "./star-visuals.ts";
import {
  deriveSystemLayout,
  mapDistance,
  orbitRadiusAu,
  orbitStateAt,
  type DistanceMapping,
  type OrbitElements,
  type PlacedOrbit,
  type SystemLayout,
} from "./system-layout.ts";

const SYSTEM_CENTRE = new Vector3(0, 1.4, 0);
const XR_SYSTEM_STAND = new Vector3(0, 0, -16.5);
const XR_SYSTEM_ELEVATION_RADIANS = (14 * Math.PI) / 180;
const NOMINAL_EYE_HEIGHT = 1.6;
const ORBIT_THICKNESS = 0.011;

export interface SystemWorldOptions {
  hostName: string;
  onFirstFrame: () => void;
  onSelectHostStar?: () => void;
  onSelectWorld?: (planet: ExoplanetProfile) => void;
  planets: readonly ExoplanetProfile[];
}

export interface SystemWorld extends MountedWorld {
  layout: SystemLayout;
  setEphemeris: (vectors: readonly EphemerisVector[] | null) => void;
  setEphemerisTime: (epoch: Date) => void;
}

const toColor3 = ([red, green, blue]: Rgb): Color3 => new Color3(red, green, blue);

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

const dioramaBodyGlow = (recipe: WorldRecipe): Color3 =>
  recipe.renderer === "rocky" && recipe.surface.lavaStrength > 0.05
    ? toColor3(recipe.surface.emissiveColor).scale(Math.min(0.7, recipe.surface.lavaStrength))
    : Color3.Black();

const buildOrbitPath = (
  mapping: DistanceMapping,
  elements: OrbitElements,
  segments: number,
): Vector3[] => {
  const points: Vector3[] = [];
  for (let index = 0; index < segments; index += 1) {
    const trueAnomaly = (index / segments) * Math.PI * 2;
    const radius = mapDistance(
      mapping,
      orbitRadiusAu(elements.semiMajorAxisAu, elements.eccentricity, trueAnomaly),
    );
    points.push(new Vector3(Math.cos(trueAnomaly) * radius, 0, Math.sin(trueAnomaly) * radius));
  }
  return points;
};

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
  bodyPlane: TransformNode;
  orbit: PlacedOrbit;
}

const buildWorld = (
  scene: Scene,
  profile: RenderQualityProfile,
  layout: SystemLayout,
  orbit: PlacedOrbit,
  root: TransformNode,
  onSelect?: (planet: ExoplanetProfile) => void,
): DrawnWorld => {
  const { planet } = orbit;
  const recipe = tuneSolarWorldRecipe(planet, deriveWorldRecipe(planet));
  const color = dioramaBodyColor(recipe);

  const orbitPlane = new TransformNode(`diorama-plane-${planet.id}`, scene);
  orbitPlane.parent = root;
  orbitPlane.rotation.x = orbit.tiltRadians;

  const ribbon = buildOrbitRibbon(
    scene,
    `diorama-orbit-${planet.id}`,
    buildOrbitPath(layout.mapping, orbit.elements, profile.systemOrbitSegments),
  );
  ribbon.parent = orbitPlane;
  const ribbonMaterial = new StandardMaterial(`diorama-orbit-material-${planet.id}`, scene);
  ribbonMaterial.disableLighting = true;
  ribbonMaterial.emissiveColor = Color3.Lerp(color, new Color3(0.42, 0.68, 0.78), 0.55);
  ribbonMaterial.alpha = 0.42;
  ribbonMaterial.disableDepthWrite = true;
  ribbonMaterial.backFaceCulling = false;
  ribbonMaterial.freeze();
  ribbon.material = ribbonMaterial;

  const body = MeshBuilder.CreateSphere(
    `diorama-world-${planet.id}`,
    { diameter: orbit.bodyRadiusSceneUnits * 2, segments: profile.systemBodySegments },
    scene,
  );
  const bodyPlane = new TransformNode(`diorama-body-plane-${planet.id}`, scene);
  bodyPlane.parent = root;
  bodyPlane.rotation.x = orbit.tiltRadians;
  body.parent = bodyPlane;
  body.applyFog = false;
  body.isPickable = true;
  const bodyMaterial = new StandardMaterial(`diorama-world-material-${planet.id}`, scene);
  bodyMaterial.diffuseColor = color;
  bodyMaterial.specularColor = Color3.Black();
  bodyMaterial.ambientColor = Color3.Black();
  bodyMaterial.emissiveColor = color.scale(0.055).add(dioramaBodyGlow(recipe));
  bodyMaterial.freeze();
  body.material = bodyMaterial;

  if (onSelect) {
    const pickTarget = MeshBuilder.CreateSphere(
      `diorama-world-target-${planet.id}`,
      { diameter: Math.max(0.62, orbit.bodyRadiusSceneUnits * 4.4), segments: 10 },
      scene,
    );
    pickTarget.parent = body;
    pickTarget.applyFog = false;
    pickTarget.isPickable = true;
    const targetMaterial = new StandardMaterial(
      `diorama-world-target-material-${planet.id}`,
      scene,
    );
    targetMaterial.disableLighting = true;
    targetMaterial.alpha = 0;
    targetMaterial.disableDepthWrite = true;
    targetMaterial.freeze();
    pickTarget.material = targetMaterial;

    for (const target of [body, pickTarget]) {
      target.actionManager = new ActionManager(scene);
      target.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPickTrigger, () => onSelect(planet)),
      );
    }
  }

  return { body, bodyPlane, orbit };
};

export const createSystemWorld = (
  host: SceneHost,
  { hostName, onFirstFrame, onSelectHostStar, onSelectWorld, planets }: SystemWorldOptions,
): SystemWorld => {
  const { camera, canvas, engine, profile, scene } = host;
  const layout = deriveSystemLayout(planets);
  const primary = planets[0];

  scene.clearColor = new Color4(0.001, 0.002, 0.006, 1);
  scene.setRenderingAutoClearDepthStencil(1, false, true, true);

  const outerReach = Math.max(
    layout.mapping.outerSceneUnits,
    ...layout.orbits.map((orbit) => orbit.semiMajorAxisSceneUnits),
  );
  camera.setTarget(SYSTEM_CENTRE.clone());
  camera.lowerRadiusLimit = 3.5;
  camera.upperRadiusLimit = outerReach * 3.6;
  camera.lowerBetaLimit = 0.16;
  camera.upperBetaLimit = Math.PI - 0.16;
  camera.alpha = -Math.PI / 2;
  camera.beta = 1.02;
  camera.radius = outerReach * 1.9;
  if (!host.isInXr()) camera.attachControl(canvas, true);

  const root = new TransformNode("diorama-root", scene);
  root.position.copyFrom(SYSTEM_CENTRE);

  const starfield = createStarfield({
    count: profile.starCount,
    scene,
    seed: hashObjectId(hostName),
    viewpoint: primary ? skyViewpointFrom(primary.observation) : null,
  });

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
    makeStarTravelTarget(scene, stellarSurface, onSelectHostStar);
  }

  const starLight = new PointLight("diorama-star-light", SYSTEM_CENTRE.clone(), scene);
  starLight.diffuse = starRecipe ? toColor3(starRecipe.color) : Color3.White();
  starLight.specular = Color3.Black();
  starLight.intensity = 1.45;

  const drawn: DrawnWorld[] = layout.orbits.map((orbit) =>
    buildWorld(scene, profile, layout, orbit, root, onSelectWorld),
  );

  const applyPositions = (elapsedSeconds: number): void => {
    for (const world of drawn) {
      world.bodyPlane.rotation.x = world.orbit.tiltRadians;
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

  let ephemerisByNaif: ReadonlyMap<number, EphemerisVector> | null = null;
  let ephemerisTime = new Date(0);
  const applyEphemerisPositions = (): void => {
    if (!ephemerisByNaif) return;
    for (const world of drawn) {
      const naifId = world.orbit.planet.solarSystem?.naifId;
      const vector = naifId === undefined ? undefined : ephemerisByNaif.get(naifId);
      if (!vector) continue;
      const position = propagateEphemerisVector(vector, ephemerisTime);
      const radiusAu = Math.hypot(position.x, position.y, position.z);
      if (!Number.isFinite(radiusAu) || radiusAu <= 0) continue;
      const displayRadius = mapDistance(layout.mapping, radiusAu);
      world.bodyPlane.rotation.x = 0;
      world.body.position.set(
        (position.x / radiusAu) * displayRadius,
        (position.z / radiusAu) * displayRadius,
        (position.y / radiusAu) * displayRadius,
      );
    }
  };

  let elapsed = 0;
  const renderObserver = scene.onBeforeRenderObservable.add(() => {
    elapsed += Math.min(engine.getDeltaTime() / 1_000, 0.05);
    const eye = scene.activeCamera?.globalPosition ?? camera.globalPosition;
    stellarSurface?.update(elapsed, eye);
    starfield.update(elapsed, eye);
    if (ephemerisByNaif) applyEphemerisPositions();
    else applyPositions(elapsed);
  });

  const firstFrameObserver = scene.onAfterRenderObservable.addOnce(onFirstFrame);

  const placeXrCamera = (initial: boolean, elevation = XR_SYSTEM_ELEVATION_RADIANS): void => {
    const rig = host.xrCamera();
    if (!rig) return;
    const headOffset = initial ? 0 : rig.realWorldHeight;
    const standoff = Math.max(XR_SYSTEM_STAND.z, -(outerReach + 3.5));
    const eyeHeight = SYSTEM_CENTRE.y + Math.abs(standoff - SYSTEM_CENTRE.z) * Math.tan(elevation);
    const deckY = eyeHeight - NOMINAL_EYE_HEIGHT + headOffset;
    rig.position.set(XR_SYSTEM_STAND.x, deckY, standoff);
    rig.setTarget(new Vector3(XR_SYSTEM_STAND.x, deckY, SYSTEM_CENTRE.z));
  };

  return {
    focusXrRig: placeXrCamera,
    layout,
    setEphemeris: (vectors) => {
      ephemerisByNaif = vectors ? new Map(vectors.map((vector) => [vector.naifId, vector])) : null;
      if (vectors?.[0]) ephemerisTime = new Date(vectors[0].epoch);
      if (ephemerisByNaif) applyEphemerisPositions();
      else applyPositions(elapsed);
    },
    setEphemerisTime: (epoch) => {
      ephemerisTime = epoch;
      applyEphemerisPositions();
    },
    restoreDesktopView: () => camera.attachControl(canvas, true),
    dispose: () => {
      scene.onBeforeRenderObservable.remove(renderObserver);
      scene.onAfterRenderObservable.remove(firstFrameObserver);
    },
  };
};
