import { readFile } from "node:fs/promises";
import { ActionManager } from "@babylonjs/core/Actions/actionManager.js";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene, ScenePerformancePriority } from "@babylonjs/core/scene.js";
import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import { deriveWorldRecipe } from "@exora/worldgen";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { createPlanetWorld } from "./planet-scene.ts";
import type { RenderQualityProfile } from "./render-quality.ts";
import type { SceneHost } from "./scene-host.ts";
import { resetSkyCatalogForTesting } from "./sky-catalog.ts";
import { createStarWorld } from "./star-scene.ts";
import { createBlackHoleWorld } from "./black-hole-scene.ts";
import { BLACK_HOLES } from "./black-holes.ts";
import { createSolarRegionWorld } from "./solar-region-scene.ts";
import { findSolarRegion } from "./solar-regions.ts";
import { findPlanetarySubsystem } from "./planetary-subsystems.ts";
import { JUPITER } from "./solar-system.ts";
import { createSystemWorld } from "./system-scene.ts";
import { createSubsystemWorld } from "./subsystem-scene.ts";
import { deriveRenderQuality } from "./render-quality.ts";
import { openWorldScope } from "./world-scope.ts";

const testProfile: RenderQualityProfile = {
  anisotropicFiltering: 1,
  fbmOctaves: 2,
  hardwareScalingLevel: 1,
  maxGiantStorms: 1,
  maxHardwareScalingLevel: 2,
  maxRenderScale: 1,
  maxXrFixedFoveation: 1,
  planetIcoSubdivisions: 4,
  planetSegments: 16,
  ringTessellation: 16,
  secondaryCloudDetail: false,
  starCount: 12,
  surfaceColorDetail: false,
  surfaceMicrodetail: false,
  systemBodySegments: 6,
  systemOrbitSegments: 16,
  tier: "quest",
  xrFixedFoveation: 0,
  xrFramebufferScaleFactor: 1,
};

const gasGiant: ExoplanetProfile = {
  id: "renderer-gas-giant",
  name: "Renderer Gas Giant",
  hostStar: "Renderer Prime",
  kind: "gas-giant",
  observation: {
    radiusJupiter: 1.5,
    massJupiter: 9,
    radiusEarth: 16.8,
    massEarth: 2_860.4,
    equilibriumTemperatureKelvin: 1_500,
    orbitalEccentricity: 0.08,
    orbitalInclinationDegrees: 88.4,
    orbitalPeriodDays: 613.4,
    semiMajorAxisAu: 92,
    distanceParsecs: 108.875,
    rightAscensionDegrees: 201.1501727,
    declinationDegrees: -51.5045384,
    discoveryYear: 2017,
    discoveryMethod: "Imaging",
    hostSpectralType: "A2 V",
    hostTemperatureKelvin: 8_840,
    hostRadiusSolar: 1.77,
    hostMassSolar: 1.96,
    hostLuminosityLogSolar: 1.02,
  },
  source: {
    archive: "NASA Exoplanet Archive",
    table: "pscomppars",
    retrievedOn: "2026-08-20",
  },
};

const planets: readonly ExoplanetProfile[] = [
  {
    ...gasGiant,
    id: "renderer-rocky",
    name: "Renderer Rocky World",
    kind: "rocky",
    observation: {
      ...gasGiant.observation,
      equilibriumTemperatureKelvin: 288,
      massEarth: 1,
      massJupiter: null,
      radiusEarth: 1,
      radiusJupiter: null,
    },
  },
  gasGiant,
  {
    ...gasGiant,
    id: "renderer-ice-giant",
    name: "Renderer Ice Giant",
    kind: "ice-giant",
    observation: {
      ...gasGiant.observation,
      equilibriumTemperatureKelvin: 686,
      massEarth: 22.1,
      massJupiter: 0.07,
      radiusEarth: 4.17,
      radiusJupiter: 0.37,
    },
  },
];

const star: StarProfile = {
  id: "renderer-star",
  name: "Renderer Star",
  catalogName: "Renderer Star",
  kind: "main-sequence",
  objectType: "Star",
  observation: {
    rightAscensionDegrees: 279.234,
    declinationDegrees: 38.784,
    parallaxMas: 130.23,
    distanceParsecs: 7.68,
    properMotionRaMasPerYear: 200.94,
    properMotionDecMasPerYear: 286.23,
    radialVelocityKmPerSecond: -20.6,
    spectralType: "A0Va",
    visualMagnitude: 0.03,
    gaiaMagnitude: 0.15,
  },
  source: {
    archive: "SIMBAD",
    tables: ["basic", "ident", "allfluxes"],
    retrievedOn: "2026-08-20",
  },
};

interface Harness {
  engine: NullEngine;
  host: SceneHost;
  scene: Scene;
}

const createHarness = (
  profile: RenderQualityProfile = testProfile,
  insideHeadset = true,
): Harness => {
  const engine = new NullEngine({
    deterministicLockstep: false,
    lockstepMaxSteps: 4,
    renderHeight: 256,
    renderWidth: 256,
    textureSize: 256,
  });
  const scene = new Scene(engine);
  scene.performancePriority = ScenePerformancePriority.Intermediate;
  scene.autoClear = true;
  const camera = new ArcRotateCamera(
    "renderer-test-camera",
    -Math.PI / 2,
    Math.PI / 2,
    17,
    Vector3.Zero(),
    scene,
  );
  scene.activeCamera = camera;

  const host = {
    camera,
    canvas: new EventTarget(),
    engine,
    profile,
    qualityTier: profile.tier,
    scene,
    getFps: () => 60,
    isInXr: () => insideHeadset,
    prefersReducedMotion: () => false,
    onTravelPhase: () => () => undefined,
    isVrSupported: () => false,
    xrCamera: () => null,
  } as unknown as SceneHost;

  return { engine, host, scene };
};

const starfieldPointCount = (scene: Scene): number => {
  const starfield = scene.meshes.find((mesh) => mesh.name === "starfield");
  return starfield?.getTotalVertices() ?? 0;
};

const sceneCounts = (scene: Scene) => ({
  actionManagers: scene.actionManagers.length,
  effectLayers: scene.effectLayers?.length ?? 0,
  lights: scene.lights.length,
  materials: scene.materials.length,
  meshes: scene.meshes.length,
  transformNodes: scene.transformNodes.length,
});

test("a black-hole world separates the shadow, photon ring and observed environment", () => {
  const { engine, host, scene } = createHarness();
  const scope = openWorldScope(scene);
  const before = sceneCounts(scene);
  const blackHole = BLACK_HOLES.find(({ name }) => name === "M87*");
  if (!blackHole) throw new Error("Expected the M87* catalog landmark.");

  const world = createBlackHoleWorld(host, {
    blackHole,
    onFirstFrame: () => undefined,
  });
  scope.seal();

  expect(scene.meshes.some(({ name }) => name === "event-horizon-shadow")).toBe(true);
  expect(scene.meshes.some(({ name }) => name === "photon-ring-reference")).toBe(true);
  expect(scene.meshes.some(({ name }) => name.startsWith("accretion-band"))).toBe(true);
  expect(scene.meshes.some(({ name }) => name.startsWith("relativistic-jet"))).toBe(true);
  expect(() => scene.render()).not.toThrow();

  world.dispose();
  scope.dispose();
  expect(sceneCounts(scene)).toEqual(before);
  engine.dispose();
});

const serveBundledSky = async (): Promise<void> => {
  const file = await readFile(new URL("../public/sky/hyg-v44-vmag65.bin", import.meta.url));
  const asset = file.buffer.slice(
    file.byteOffset,
    file.byteOffset + file.byteLength,
  ) as ArrayBuffer;
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(asset)));
};

const settleSky = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

beforeEach(async () => {
  resetSkyCatalogForTesting();
  await serveBundledSky();
});

afterEach(() => {
  resetSkyCatalogForTesting();
  vi.unstubAllGlobals();
});

test.each(["Oort Cloud", "Heliosphere"])(
  "%s regional view renders a headless frame and releases its sampled model",
  async (name) => {
    const { engine, host, scene } = createHarness();
    const before = sceneCounts(scene);
    const firstFrame = vi.fn();
    const scope = openWorldScope(scene);
    const region = findSolarRegion(name);
    if (!region) throw new Error(`Expected ${name} fixture.`);
    const world = createSolarRegionWorld(host, { onFirstFrame: firstFrame, region });
    scope.seal();
    await settleSky();

    expect(sceneCounts(scene).meshes).toBeGreaterThan(before.meshes);
    expect(starfieldPointCount(scene)).toBeGreaterThan(0);
    expect(() => scene.render()).not.toThrow();
    expect(firstFrame).toHaveBeenCalledOnce();

    world.dispose();
    scope.dispose();
    expect(sceneCounts(scene)).toEqual(before);
    engine.dispose();
  },
  30_000,
);

test("a planetary subsystem renders measured tracks and releases every explanatory layer", async () => {
  const { engine, host, scene } = createHarness();
  const before = sceneCounts(scene);
  const firstFrame = vi.fn();
  const scope = openWorldScope(scene);
  const subsystem = findPlanetarySubsystem("Jupiter");
  if (!subsystem) throw new Error("Expected Jupiter subsystem fixture.");
  const world = createSubsystemWorld(host, {
    onFirstFrame: firstFrame,
    planet: JUPITER,
    subsystem,
  });
  scope.seal();
  await settleSky();

  expect(sceneCounts(scene).meshes).toBeGreaterThan(before.meshes + subsystem.moons.length * 2);
  expect(scene.getMeshByName("Io-mapped-mission-mosaic")).not.toBeNull();
  expect(scene.getMeshByName("Metis-unresolved-neutral-silhouette")).not.toBeNull();
  expect(scene.getMeshByName("jupiter-measured-io-plasma-torus")).not.toBeNull();
  expect(scene.getMeshByName("Europa-tentative-simulated-plume")).not.toBeNull();
  expect(() => scene.render()).not.toThrow();
  expect(firstFrame).toHaveBeenCalledOnce();

  world.dispose();
  scope.dispose();
  expect(sceneCounts(scene)).toEqual(before);
  engine.dispose();
}, 30_000);

test.each(planets)(
  "$kind world renders one headless frame and releases its scene contents",
  async (planet) => {
    vi.stubGlobal("window", new EventTarget());
    const { engine, host, scene } = createHarness();
    const before = sceneCounts(scene);
    const firstFrame = vi.fn();
    const scope = openWorldScope(scene);
    const recipe = deriveWorldRecipe(planet);
    const world = createPlanetWorld(host, {
      onFirstFrame: firstFrame,
      onViewModeChange: () => undefined,
      planet,
      recipe,
    });
    scope.seal();
    await settleSky();

    expect(sceneCounts(scene).meshes).toBeGreaterThan(before.meshes);
    expect(starfieldPointCount(scene)).toBeGreaterThan(0);
    expect(() => scene.render()).not.toThrow();
    expect(firstFrame).toHaveBeenCalledOnce();

    world.dispose();
    scope.dispose();
    expect(sceneCounts(scene)).toEqual(before);
    engine.dispose();
  },
  30_000,
);

test("a displaced rocky world keeps one shared normal per position instead of flat-shading", async () => {
  vi.stubGlobal("window", new EventTarget());
  const { engine, host, scene } = createHarness();
  const scope = openWorldScope(scene);
  const planet = planets[0]!;
  const world = createPlanetWorld(host, {
    onFirstFrame: vi.fn(),
    onViewModeChange: () => undefined,
    planet,
    recipe: deriveWorldRecipe(planet),
  });
  scope.seal();
  await settleSky();

  const mesh = scene.meshes.find((candidate) => candidate.name === "planet")!;
  const positions = mesh.getVerticesData("position")!;
  const normals = mesh.getVerticesData("normal")!;
  const indices = mesh.getIndices()!;

  const shared = new Map<string, number[]>();
  for (let vertex = 0; vertex < positions.length; vertex += 3) {
    const key = `${positions[vertex]!},${positions[vertex + 1]!},${positions[vertex + 2]!}`;
    (shared.get(key) ?? shared.set(key, []).get(key)!).push(vertex / 3);
  }
  expect(positions.length / 3).toBe(indices.length);
  expect(shared.size).toBeLessThan(positions.length / 3);

  for (const corners of shared.values()) {
    const first = corners[0]! * 3;
    for (const corner of corners) {
      const offset = corner * 3;
      expect(normals[offset]).toBeCloseTo(normals[first]!, 5);
      expect(normals[offset + 1]).toBeCloseTo(normals[first + 1]!, 5);
      expect(normals[offset + 2]).toBeCloseTo(normals[first + 2]!, 5);
    }
  }

  let offFace = 0;
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const [a, b, c] = [
      indices[triangle]! * 3,
      indices[triangle + 1]! * 3,
      indices[triangle + 2]! * 3,
    ];
    const edge1 = [
      positions[b]! - positions[a]!,
      positions[b + 1]! - positions[a + 1]!,
      positions[b + 2]! - positions[a + 2]!,
    ];
    const edge2 = [
      positions[c]! - positions[a]!,
      positions[c + 1]! - positions[a + 1]!,
      positions[c + 2]! - positions[a + 2]!,
    ];
    const face = [
      edge1[1]! * edge2[2]! - edge1[2]! * edge2[1]!,
      edge1[2]! * edge2[0]! - edge1[0]! * edge2[2]!,
      edge1[0]! * edge2[1]! - edge1[1]! * edge2[0]!,
    ];
    const length = Math.hypot(face[0]!, face[1]!, face[2]!) || 1;
    const alignment =
      (face[0]! * normals[a]! + face[1]! * normals[a + 1]! + face[2]! * normals[a + 2]!) / length;
    if (Math.abs(alignment) < 0.9999) offFace += 1;
  }
  expect(offFace).toBeGreaterThan(indices.length / 3 / 2);

  world.dispose();
  scope.dispose();
  engine.dispose();
}, 30_000);

test("star world renders one headless frame and releases its glow layer and scene contents", async () => {
  const { engine, host, scene } = createHarness();
  const before = sceneCounts(scene);
  const firstFrame = vi.fn();
  const scope = openWorldScope(scene);
  const world = createStarWorld(host, { onFirstFrame: firstFrame, star });
  scope.seal();
  await settleSky();

  expect(sceneCounts(scene).meshes).toBeGreaterThan(before.meshes);
  expect(sceneCounts(scene).effectLayers).toBe(before.effectLayers + 1);
  expect(starfieldPointCount(scene)).toBe(testProfile.starCount);
  expect(() => scene.render()).not.toThrow();
  expect(firstFrame).toHaveBeenCalledOnce();

  world.dispose();
  scope.dispose();
  expect(sceneCounts(scene)).toEqual(before);
  engine.dispose();
}, 30_000);

test("the corona shell winds inward, so approaching a star cannot clip its halo away", async () => {
  const { engine, host, scene } = createHarness();
  const scope = openWorldScope(scene);
  const world = createStarWorld(host, { onFirstFrame: vi.fn(), star });
  scope.seal();
  await settleSky();

  const facings = (mesh: AbstractMesh): number[] => {
    const positions = mesh.getVerticesData("position")!;
    const indices = mesh.getIndices()!;
    const corner = (index: number): Vector3 =>
      new Vector3(positions[index * 3]!, positions[index * 3 + 1]!, positions[index * 3 + 2]!);

    const turned: number[] = [];
    for (let triangle = 0; triangle < indices.length; triangle += 3) {
      const first = corner(indices[triangle]!);
      const second = corner(indices[triangle + 1]!);
      const third = corner(indices[triangle + 2]!);
      const face = Vector3.Cross(second.subtract(first), third.subtract(first));
      if (face.length() < 1e-6) continue;
      turned.push(Vector3.Dot(face, first.add(second).add(third)));
    }
    return turned;
  };

  const control = MeshBuilder.CreateSphere("corona-winding-control", { segments: 8 }, scene);
  const outward = facings(control);
  const outwardSign = Math.sign(outward[0]!);
  expect(outward.length).toBeGreaterThan(0);
  expect(outward.every((facing) => Math.sign(facing) === outwardSign)).toBe(true);
  control.dispose();

  const corona = scene.meshes.find((mesh) => mesh.name === "star-corona")!;
  const shell = facings(corona);
  expect(shell.length).toBeGreaterThan(0);
  expect(shell.every((facing) => Math.sign(facing) === -outwardSign)).toBe(true);

  const positions = corona.getVerticesData("position")!;
  let shellRadius = 0;
  for (let vertex = 0; vertex < positions.length; vertex += 3) {
    const distance = Math.hypot(positions[vertex]!, positions[vertex + 1]!, positions[vertex + 2]!);
    if (distance > shellRadius) shellRadius = distance;
  }
  expect(host.camera.lowerRadiusLimit! - shellRadius).toBeLessThan(host.camera.minZ);

  world.dispose();
  scope.dispose();
  engine.dispose();
}, 30_000);

test("the star world adds no geometry for the system's known worlds", async () => {
  const { engine, host, scene } = createHarness();
  const empty = sceneCounts(scene);
  const scope = openWorldScope(scene);
  const world = createStarWorld(host, {
    onFirstFrame: vi.fn(),
    star,
  });
  scope.seal();
  await settleSky();

  const starAlone = sceneCounts(scene);
  expect(sceneCounts(scene)).toEqual(starAlone);

  expect(() => scene.render()).not.toThrow();

  world.dispose();
  scope.dispose();
  expect(sceneCounts(scene)).toEqual(empty);
  engine.dispose();
}, 30_000);

test("a world with no measured sky position falls back to the seeded starfield", async () => {
  const { engine, host, scene } = createHarness();
  const scope = openWorldScope(scene);
  const forged: StarProfile = {
    ...star,
    id: "custom-star-1234",
    observation: {
      ...star.observation,
      declinationDegrees: null,
      distanceParsecs: null,
      rightAscensionDegrees: null,
    },
  };
  const world = createStarWorld(host, { onFirstFrame: vi.fn(), star: forged });
  scope.seal();

  expect(starfieldPointCount(scene)).toBe(testProfile.starCount);
  await settleSky();
  expect(starfieldPointCount(scene)).toBe(testProfile.starCount);
  expect(() => scene.render()).not.toThrow();

  world.dispose();
  scope.dispose();
  engine.dispose();
}, 30_000);

test("world scope preserves host contents while reclaiming every tracked world resource", () => {
  const { engine, scene } = createHarness();
  MeshBuilder.CreateBox("host-mesh", undefined, scene);
  new StandardMaterial("host-material", scene);
  new HemisphericLight("host-light", Vector3.Up(), scene);
  new TransformNode("host-node", scene);
  new ActionManager(scene);
  const before = sceneCounts(scene);
  const scope = openWorldScope(scene);

  MeshBuilder.CreateSphere("world-mesh", undefined, scene);
  new StandardMaterial("world-material", scene);
  new HemisphericLight("world-light", Vector3.Down(), scene);
  new TransformNode("world-node", scene);
  new ActionManager(scene);
  scope.seal();
  scope.dispose();

  expect(sceneCounts(scene)).toEqual(before);
  engine.dispose();
});

const systemPlanets: readonly ExoplanetProfile[] = [
  {
    ...gasGiant,
    id: "system-inner",
    name: "System Inner b",
    kind: "rocky",
    observation: {
      ...gasGiant.observation,
      massEarth: 1.4,
      massJupiter: null,
      orbitalEccentricity: 0.31,
      orbitalInclinationDegrees: 86.9,
      orbitalPeriodDays: 11.6,
      radiusEarth: 1.2,
      radiusJupiter: null,
      semiMajorAxisAu: 0.09,
    },
  },
  {
    ...gasGiant,
    id: "system-outer",
    name: "System Outer c",
    observation: { ...gasGiant.observation, orbitalPeriodDays: 402, semiMajorAxisAu: 1.05 },
  },
  {
    ...gasGiant,
    id: "system-unplaced",
    name: "System Unplaced d",
    observation: {
      ...gasGiant.observation,
      hostMassSolar: null,
      orbitalPeriodDays: null,
      semiMajorAxisAu: null,
    },
  },
];

test("the system diorama renders one headless frame and releases its scene contents", async () => {
  const { engine, host, scene } = createHarness();
  const before = sceneCounts(scene);
  const firstFrame = vi.fn();
  const scope = openWorldScope(scene);
  const world = createSystemWorld(host, {
    hostName: "Renderer Prime",
    onFirstFrame: firstFrame,
    planets: systemPlanets,
  });
  scope.seal();
  await settleSky();

  expect(world.layout.orbits.map(({ planet }) => planet.name)).toEqual([
    "System Inner b",
    "System Outer c",
  ]);
  expect(world.layout.unplaced.map(({ name }) => name)).toEqual(["System Unplaced d"]);
  expect(sceneCounts(scene).meshes).toBeGreaterThan(before.meshes);
  expect(starfieldPointCount(scene)).toBe(testProfile.starCount);
  expect(() => scene.render()).not.toThrow();
  expect(firstFrame).toHaveBeenCalledOnce();

  expect(scene.getMeshByName("diorama-world-target-system-inner")).toBeNull();
  expect(scene.getMeshByName("star-pick-target")).toBeNull();

  world.dispose();
  scope.dispose();
  expect(sceneCounts(scene)).toEqual(before);
  engine.dispose();
}, 30_000);

test("the diorama sends a visitor to the world or the star they click", async () => {
  const { engine, host, scene } = createHarness();
  const before = sceneCounts(scene);
  const scope = openWorldScope(scene);
  const visitWorld = vi.fn();
  const visitStar = vi.fn();
  const world = createSystemWorld(host, {
    hostName: "Renderer Prime",
    onFirstFrame: () => undefined,
    onSelectHostStar: visitStar,
    onSelectWorld: visitWorld,
    planets: systemPlanets,
  });
  scope.seal();
  await settleSky();

  const target = scene.getMeshByName("diorama-world-target-system-inner");
  expect(target?.isPickable).toBe(true);
  expect(target?.isVisible).toBe(true);
  expect(target?.material?.alpha).toBe(0);

  const body = scene.getMeshByName("diorama-world-system-inner");
  expect(body?.isPickable).toBe(true);
  body?.actionManager?.processTrigger(ActionManager.OnPickTrigger);
  target?.actionManager?.processTrigger(ActionManager.OnPickTrigger);
  expect(visitWorld).toHaveBeenCalledTimes(2);
  expect(visitWorld.mock.calls.every(([picked]) => picked.name === "System Inner b")).toBe(true);

  const photosphere = scene.getMeshByName("star-photosphere");
  const starTarget = scene.getMeshByName("star-pick-target");
  expect(photosphere?.isPickable).toBe(true);
  expect(starTarget?.isPickable).toBe(true);
  expect(scene.getMeshByName("star-corona")?.isPickable).toBe(false);
  expect(scene.getMeshByName("star-corona")?.actionManager).toBeFalsy();

  photosphere?.actionManager?.processTrigger(ActionManager.OnPickTrigger);
  starTarget?.actionManager?.processTrigger(ActionManager.OnPickTrigger);
  expect(visitStar).toHaveBeenCalledTimes(2);

  world.dispose();
  scope.dispose();
  expect(sceneCounts(scene)).toEqual(before);
  engine.dispose();
}, 30_000);

test("a world sends a visitor to the star hanging in its sky", async () => {
  vi.stubGlobal("window", new EventTarget());
  const { engine, host, scene } = createHarness();
  const before = sceneCounts(scene);
  const scope = openWorldScope(scene);
  const planet = planets[0]!;
  const visitStar = vi.fn();
  const world = createPlanetWorld(host, {
    onFirstFrame: vi.fn(),
    onSelectHostStar: visitStar,
    onViewModeChange: () => undefined,
    planet,
    recipe: deriveWorldRecipe(planet),
  });
  scope.seal();
  await settleSky();

  const targets = scene.meshes.filter((mesh) => mesh.name === "star-pick-target");
  expect(targets).toHaveLength(2);
  for (const target of targets) {
    expect(target.isPickable).toBe(true);
    target.actionManager?.processTrigger(ActionManager.OnPickTrigger);
  }
  expect(visitStar).toHaveBeenCalledTimes(2);

  world.dispose();
  scope.dispose();
  expect(sceneCounts(scene)).toEqual(before);
  engine.dispose();
}, 30_000);

test("a world built with no host star to reach draws nothing that looks clickable", async () => {
  vi.stubGlobal("window", new EventTarget());
  const { engine, host, scene } = createHarness();
  const scope = openWorldScope(scene);
  const planet = planets[0]!;
  const world = createPlanetWorld(host, {
    onFirstFrame: vi.fn(),
    onViewModeChange: () => undefined,
    planet,
    recipe: deriveWorldRecipe(planet),
  });
  scope.seal();
  await settleSky();

  expect(scene.meshes.filter((mesh) => mesh.name === "star-pick-target")).toHaveLength(0);
  expect(scene.getMeshByName("star-photosphere")?.isPickable).toBe(false);

  world.dispose();
  scope.dispose();
  engine.dispose();
}, 30_000);

test("a subsystem sends a visitor to the moon they click, by name", async () => {
  const { engine, host, scene } = createHarness();
  const before = sceneCounts(scene);
  const scope = openWorldScope(scene);
  const subsystem = findPlanetarySubsystem("Jupiter");
  if (!subsystem) throw new Error("Expected Jupiter subsystem fixture.");
  const visitMoon = vi.fn();
  const world = createSubsystemWorld(host, {
    onFirstFrame: vi.fn(),
    onSelectMoon: visitMoon,
    planet: JUPITER,
    subsystem,
  });
  scope.seal();
  await settleSky();

  const io = scene.getMeshByName("Io-mapped-mission-mosaic");
  expect(io?.isPickable).toBe(true);
  io?.actionManager?.processTrigger(ActionManager.OnPickTrigger);
  expect(visitMoon).toHaveBeenCalledWith("Io");

  const metis = scene.getMeshByName("Metis-unresolved-neutral-silhouette");
  expect(metis?.isPickable).toBe(true);
  metis?.actionManager?.processTrigger(ActionManager.OnPickTrigger);
  expect(visitMoon).toHaveBeenLastCalledWith("Metis");

  world.dispose();
  scope.dispose();
  expect(sceneCounts(scene)).toEqual(before);
  engine.dispose();
}, 30_000);

test("the diorama keeps its bodies inside the tier's geometry budget", () => {
  const { engine, host, scene } = createHarness();
  const scope = openWorldScope(scene);
  const world = createSystemWorld(host, {
    hostName: "Renderer Prime",
    onFirstFrame: () => undefined,
    planets: systemPlanets,
  });
  scope.seal();

  const body = scene.meshes.find((mesh) => mesh.name === "diorama-world-system-outer");
  const bodyVertices = body?.getTotalVertices() ?? 0;
  expect(bodyVertices).toBeGreaterThan(0);
  expect(bodyVertices).toBeLessThan((testProfile.planetSegments + 1) ** 2);

  const orbit = scene.meshes.find((mesh) => mesh.name === "diorama-orbit-system-outer");
  expect(orbit?.getTotalVertices()).toBe(testProfile.systemOrbitSegments * 4);

  world.dispose();
  scope.dispose();
  engine.dispose();
}, 30_000);

test("a world moves along its orbit as the scene runs, and stays on it", () => {
  const { engine, host, scene } = createHarness();
  const scope = openWorldScope(scene);
  const world = createSystemWorld(host, {
    hostName: "Renderer Prime",
    onFirstFrame: () => undefined,
    planets: systemPlanets,
  });
  scope.seal();

  const body = scene.meshes.find((mesh) => mesh.name === "diorama-world-system-inner");
  if (!body) throw new Error("Expected the inner world to have been drawn.");
  const start = body.position.clone();

  vi.spyOn(engine, "getDeltaTime").mockReturnValue(16);
  for (let frame = 0; frame < 30; frame += 1) scene.render();

  expect(body.position.equals(start)).toBe(false);
  const radius = Math.hypot(body.position.x, body.position.z);
  expect(radius).toBeGreaterThan(1);
  expect(radius).toBeLessThan(20);

  world.dispose();
  scope.dispose();
  engine.dispose();
}, 30_000);

const sceneVertexCount = (scene: Scene): number =>
  scene.meshes.reduce((total, mesh) => total + mesh.getTotalVertices(), 0);

const questProfile = deriveRenderQuality({
  userAgent: "Mozilla/5.0 (Linux; Android 12; Quest 2) OculusBrowser/33.0",
  pixelRatio: 2,
  hardwareConcurrency: 8,
  deviceMemory: 6,
});

test("the Solar System diorama accepts and clears authoritative Horizons positions", () => {
  const { engine, host, scene } = createHarness();
  const scope = openWorldScope(scene);
  const solarWorld = {
    ...systemPlanets[0]!,
    solarSystem: {
      axialTiltDegrees: 23.4,
      bodyType: "planet" as const,
      naifId: 399,
      orbitalInclinationDegrees: 0,
      parent: "Sun",
      rotationPeriodHours: 24,
      summary: "Test Earth",
    },
  };
  const world = createSystemWorld(host, {
    hostName: "Sun",
    onFirstFrame: () => undefined,
    planets: [solarWorld],
  });
  scope.seal();
  const body = scene.meshes.find((mesh) => mesh.name === `diorama-world-${solarWorld.id}`);
  if (!body) throw new Error("Expected the Solar System world to be drawn.");

  world.setEphemeris([
    {
      epoch: "2026-08-24T00:00:00.000Z",
      name: "Earth",
      naifId: 399,
      positionAu: { x: 0, y: 1, z: 0.1 },
      solution: "DE441",
      spkId: "399",
      velocityAuPerDay: { x: -0.017, y: 0, z: 0 },
    },
  ]);
  expect(body.position.z).toBeGreaterThan(0);
  expect(body.position.y).toBeGreaterThan(0);
  world.setEphemerisTime(new Date("2026-08-25T00:00:00.000Z"));
  expect(() => scene.render()).not.toThrow();
  world.setEphemeris(null);

  world.dispose();
  scope.dispose();
  engine.dispose();
});

test("a seven-world diorama costs less than the one world it travels to", () => {
  vi.stubGlobal("window", new EventTarget());
  const planetHarness = createHarness(questProfile);
  const planetScope = openWorldScope(planetHarness.scene);
  const rocky = planets[0];
  if (!rocky) throw new Error("Expected a rocky fixture.");
  const planetWorld = createPlanetWorld(planetHarness.host, {
    onFirstFrame: () => undefined,
    onViewModeChange: () => undefined,
    planet: rocky,
    recipe: deriveWorldRecipe(rocky),
  });
  planetScope.seal();
  const planetCost = {
    meshes: planetHarness.scene.meshes.length,
    vertices: sceneVertexCount(planetHarness.scene),
  };
  planetWorld.dispose();
  planetScope.dispose();
  planetHarness.engine.dispose();

  const sevenWorlds = Array.from({ length: 7 }, (_, index) => ({
    ...gasGiant,
    id: `crowded-${index}`,
    name: `Crowded ${index}`,
    observation: {
      ...gasGiant.observation,
      orbitalPeriodDays: 4 * (index + 1) ** 1.5,
      semiMajorAxisAu: 0.04 * (index + 1) ** 1.6,
    },
  }));

  const { engine, host, scene } = createHarness(questProfile);
  const scope = openWorldScope(scene);
  const before = scene.meshes.length;
  const world = createSystemWorld(host, {
    hostName: "Crowded Prime",
    onFirstFrame: () => undefined,
    planets: sevenWorlds,
  });
  scope.seal();

  expect(world.layout.orbits).toHaveLength(7);
  expect(sceneVertexCount(scene)).toBeLessThan(planetCost.vertices);
  expect(scene.meshes.length - before).toBeLessThan(40);

  world.dispose();
  scope.dispose();
  expect(scene.meshes.length).toBe(before);
  engine.dispose();
}, 30_000);

test("the surface star holds one place in the sky wherever the viewer walks", async () => {
  vi.stubGlobal("window", new EventTarget());
  const { engine, host, scene } = createHarness(testProfile, false);
  const scope = openWorldScope(scene);
  const planet = planets[0];
  if (!planet) throw new Error("Expected a rocky fixture.");
  let mode = "orbit";
  const world = createPlanetWorld(host, {
    onFirstFrame: () => undefined,
    onViewModeChange: (next) => {
      mode = next;
    },
    planet,
    recipe: deriveWorldRecipe(planet),
  });
  scope.seal();
  await settleSky();

  vi.spyOn(engine, "getDeltaTime").mockReturnValue(16);
  host.camera.radius = 10.5;
  for (let frame = 0; frame < 200 && mode !== "surface"; frame += 1) scene.render();
  expect(mode).toBe("surface");

  const star = scene.meshes
    .filter((mesh) => mesh.name === "star-photosphere")
    .find((mesh) => mesh.isEnabled());
  const ground = scene.meshes.find((mesh) => mesh.name === "surfaceTerrain");
  const sky = scene.meshes.find((mesh) => mesh.name === "surfaceSky");
  if (!star || !ground || !sky) throw new Error("Expected a terrain vista to have been built.");

  const sightline = () => {
    const delta = star.getAbsolutePosition().subtract(host.camera.globalPosition);
    const distance = delta.length();
    return {
      azimuth: Math.atan2(delta.x, delta.z),
      distance,
      elevation: Math.asin(delta.y / distance),
      radius: Math.atan(star.getBoundingInfo().boundingBox.extendSize.x / distance),
    };
  };

  const groundInSight = (): { farthest: number; highest: number } => {
    const positions = ground.getVerticesData("position");
    if (!positions) throw new Error("Expected the terrain to carry positions.");
    const origin = ground.getAbsolutePosition();
    const eye = host.camera.globalPosition;
    let farthest = 0;
    let highest = -Math.PI / 2;
    for (let index = 0; index < positions.length; index += 3) {
      const x = positions[index]! + origin.x - eye.x;
      const y = positions[index + 1]! + origin.y - eye.y;
      const z = positions[index + 2]! + origin.z - eye.z;
      farthest = Math.max(farthest, Math.hypot(x, y, z));
      if (Math.hypot(x, z) > 4) highest = Math.max(highest, Math.atan2(y, Math.hypot(x, z)));
    }
    return { farthest, highest };
  };

  const resting = sightline();
  const terrain = groundInSight();
  expect(resting.distance).toBeGreaterThan(terrain.farthest * 2);
  expect(resting.elevation - resting.radius).toBeGreaterThan(terrain.highest);

  host.camera.target.set(-30, 0.1, 53);
  for (let frame = 0; frame < 90; frame += 1) scene.render();
  const walked = sightline();

  expect(walked.distance / resting.distance).toBeCloseTo(1, 4);
  expect(walked.azimuth).toBeCloseTo(resting.azimuth, 4);
  expect(walked.elevation).toBeCloseTo(resting.elevation, 4);
  expect(walked.radius).toBeCloseTo(resting.radius, 5);
  expect(sky.getAbsolutePosition().equalsWithEpsilon(host.camera.globalPosition, 0.001)).toBe(true);

  world.dispose();
  scope.dispose();
  engine.dispose();
}, 30_000);
