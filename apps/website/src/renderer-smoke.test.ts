import { readFile } from "node:fs/promises";
import { ActionManager } from "@babylonjs/core/Actions/actionManager.js";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene } from "@babylonjs/core/scene.js";
import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import { deriveWorldRecipe } from "@exora/worldgen";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { createPlanetWorld } from "./planet-scene.ts";
import type { RenderQualityProfile } from "./render-quality.ts";
import type { SceneHost } from "./scene-host.ts";
import { resetSkyCatalogForTesting } from "./sky-catalog.ts";
import { createStarWorld } from "./star-scene.ts";
import { createSystemWorld } from "./system-scene.ts";
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

const createHarness = (): Harness => {
  const engine = new NullEngine({
    deterministicLockstep: false,
    lockstepMaxSteps: 4,
    renderHeight: 256,
    renderWidth: 256,
    textureSize: 256,
  });
  const scene = new Scene(engine);
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
    profile: testProfile,
    qualityTier: testProfile.tier,
    scene,
    getFps: () => 60,
    isInXr: () => true,
    isVrSupported: () => false,
    refreshConsole: () => undefined,
    xrCamera: () => null,
  } as unknown as SceneHost;

  return { engine, host, scene };
};

/** How many stars the background field ended up submitting, catalogue or seeded. */
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

/**
 * The bundled sky, served the way the browser would.
 *
 * Every fixture below carries a real right ascension, declination and distance, so each world
 * asks for the catalogue on the way up. Serving the committed asset here is what makes these
 * smoke tests cover the sky the renderer actually draws, rather than only the seeded fallback
 * it keeps for World Forge.
 */
const serveBundledSky = async (): Promise<void> => {
  const file = await readFile(new URL("../public/sky/hyg-v44-vmag65.bin", import.meta.url));
  const asset = file.buffer.slice(
    file.byteOffset,
    file.byteOffset + file.byteLength,
  ) as ArrayBuffer;
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(asset)));
};

/** Lets the memoized download and the microtask that fills the starfield both settle. */
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
  // This star has a measured position and distance, so its sky comes from the catalogue and is
  // capped by the tier's budget rather than by how many stars happen to be visible.
  expect(starfieldPointCount(scene)).toBe(testProfile.starCount);
  expect(() => scene.render()).not.toThrow();
  expect(firstFrame).toHaveBeenCalledOnce();

  world.dispose();
  scope.dispose();
  expect(sceneCounts(scene)).toEqual(before);
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

  // Seeded geometry is applied during the build itself, with no catalogue and no download: a
  // World Forge object has no place among the real stars to be looked at from.
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

/**
 * A host with three worlds on three different orbits, one of which the archive never placed.
 *
 * The diorama has to draw the two it can and hand the third back rather than inventing an orbit
 * for it, so the fixture carries that case rather than only the happy one.
 */
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
  const travelled: string[] = [];
  const scope = openWorldScope(scene);
  const world = createSystemWorld(host, {
    hostName: "Renderer Prime",
    onFirstFrame: firstFrame,
    onSelectHostStar: () => travelled.push("star"),
    onSelectWorld: (planet) => travelled.push(planet.name),
    planets: systemPlanets,
  });
  scope.seal();
  await settleSky();

  // Two placed worlds, and the third named rather than given an orbit it does not have.
  expect(world.layout.orbits.map(({ planet }) => planet.name)).toEqual([
    "System Inner b",
    "System Outer c",
  ]);
  expect(world.layout.unplaced.map(({ name }) => name)).toEqual(["System Unplaced d"]);
  expect(sceneCounts(scene).meshes).toBeGreaterThan(before.meshes);
  // The system's own sky, from the position every planet in it reports.
  expect(starfieldPointCount(scene)).toBe(testProfile.starCount);
  expect(() => scene.render()).not.toThrow();
  expect(firstFrame).toHaveBeenCalledOnce();

  // Pointing at a world is what travels to it, so the pick targets have to be reachable.
  const target = scene.meshes.find((mesh) => mesh.name === "system-world-system-inner");
  expect(target?.isPickable).toBe(true);

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

  // A whole system is on screen at once, so each body is far coarser than the single full-detail
  // world the same tier draws. This is the assertion that keeps a future edit from promoting them.
  const body = scene.meshes.find((mesh) => mesh.name === "system-world-system-outer");
  const bodyVertices = body?.getTotalVertices() ?? 0;
  expect(bodyVertices).toBeGreaterThan(0);
  expect(bodyVertices).toBeLessThan((testProfile.planetSegments + 1) ** 2);

  // Each orbit is a four-sided tube, so its whole cost is four vertices per segment.
  const orbit = scene.meshes.find((mesh) => mesh.name === "system-orbit-line-system-outer");
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

  const body = scene.meshes.find((mesh) => mesh.name === "system-world-system-inner");
  if (!body) throw new Error("Expected the inner world to have been drawn.");
  const start = body.position.clone();

  // `scene.render()` on its own never opens a frame, so the engine reports a zero delta and no
  // scene that advances on wall-clock time would move at all. One running headset frame is 16 ms.
  vi.spyOn(engine, "getDeltaTime").mockReturnValue(16);
  for (let frame = 0; frame < 30; frame += 1) scene.render();

  expect(body.position.equals(start)).toBe(false);
  // An eccentric orbit changes its radius as it goes, but never leaves the mapped band entirely.
  const radius = Math.hypot(body.position.x, body.position.z);
  expect(radius).toBeGreaterThan(1);
  expect(radius).toBeLessThan(20);

  world.dispose();
  scope.dispose();
  engine.dispose();
}, 30_000);
