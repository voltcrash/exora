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

const createHarness = (profile: RenderQualityProfile = testProfile): Harness => {
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
    profile,
    qualityTier: profile.tier,
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

/**
 * A displaced rocky world used to light up as a lattice of hard-edged facets.
 *
 * Babylon's icosphere emits an unshared vertex per triangle corner and gets its smooth look from
 * `normal = normalize(position)`, not from shared topology. Recomputing normals from the displaced
 * geometry over that index buffer therefore gave every vertex the normal of the one face it
 * belongs to, flat-shading the planet — a visible grid over every rocky surface. The normals are
 * merged back together by position, so this asserts the property that was broken: corners sitting
 * at the same point carry the same normal, and it is not that face's own flat normal.
 */
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

  // The premise: this mesh really does carry unshared corners, so welding is load-bearing.
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

  // Flat shading would leave every corner exactly perpendicular to its own triangle. A welded
  // normal is the average of the faces meeting there, so it leans off at least some of them.
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

/**
 * The star view used to draw this system itself, on orbits nothing measured.
 *
 * Ring spacing came from the world's index in the list, the tilt from that index modulo three,
 * the body size from a two-way guess at the planet's kind, and the rate of turn from the index
 * again. The measured orbits belong to the diorama, which places every world from its own
 * semi-major axis, eccentricity, inclination and period, so this scene draws none of it — and
 * this is the test that keeps a future edit from putting the invented version back.
 */
test("the star world adds no geometry for the system's known worlds, and still routes to them", async () => {
  const { engine, host, scene } = createHarness();
  const empty = sceneCounts(scene);
  const scope = openWorldScope(scene);
  const travelled: string[] = [];
  const world = createStarWorld(host, {
    onFirstFrame: vi.fn(),
    onSelectSystem: () => travelled.push("system"),
    star,
  });
  scope.seal();
  await settleSky();

  // The star, its corona and glare, and the sky — and that is still all of it once a system with
  // three worlds in it has been handed over.
  const starAlone = sceneCounts(scene);
  world.setSystemWorlds(planets, (planet) => travelled.push(planet.name));
  expect(sceneCounts(scene)).toEqual(starAlone);

  // What a system does reach the wearer as: entries on the console, alongside the route to the
  // diorama where the orbits the archive actually reports are drawn.
  const actions = world.console.sceneActions();
  expect(actions.map(({ label }) => label)).toEqual([
    "Recentre me",
    "View the whole system",
    ...planets.map(({ name }) => name),
  ]);
  actions.find(({ id }) => id === "host-system")?.onSelect?.();
  actions.find(({ id }) => id === `planet-${gasGiant.id}`)?.onSelect?.();
  expect(travelled).toEqual(["system", gasGiant.name]);

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
  const target = scene.meshes.find((mesh) => mesh.name === "diorama-world-system-inner");
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
  const body = scene.meshes.find((mesh) => mesh.name === "diorama-world-system-outer");
  const bodyVertices = body?.getTotalVertices() ?? 0;
  expect(bodyVertices).toBeGreaterThan(0);
  expect(bodyVertices).toBeLessThan((testProfile.planetSegments + 1) ** 2);

  // Each orbit is a four-sided tube, so its whole cost is four vertices per segment.
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

/** Every vertex the scene's own meshes hold, which is what a frame has to transform and submit. */
const sceneVertexCount = (scene: Scene): number =>
  scene.meshes.reduce((total, mesh) => total + mesh.getTotalVertices(), 0);

/** The budget an actual Quest 2 gets, rather than the deliberately tiny one the suite runs on. */
const questProfile = deriveRenderQuality({
  userAgent: "Mozilla/5.0 (Linux; Android 12; Quest 2) OculusBrowser/33.0",
  pixelRatio: 2,
  hardwareConcurrency: 8,
  deviceMemory: 6,
});

test("a seven-world diorama costs less than the one world it travels to", () => {
  // The claim requirement the whole budget rests on: a system is affordable precisely because
  // none of it is drawn at the detail a single arrived-at world gets. Asserted against the planet
  // world at the same tier rather than against a literal, so retuning a tier cannot quietly
  // invert it — and measured on the real Quest budget, not the deliberately tiny suite profile.
  //
  // At the time of writing: 19,906 vertices across 25 meshes for seven worlds, their orbits, the
  // resolved host star and the sky, against 32,293 across 42 for one rocky world on its own.
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
  // Draw calls are the other half of the cost, and the half a per-body addition shows up in first.
  expect(scene.meshes.length).toBeLessThan(planetCost.meshes);

  world.dispose();
  scope.dispose();
  expect(scene.meshes.length).toBe(before);
  engine.dispose();
}, 30_000);
