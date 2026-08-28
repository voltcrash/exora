import { readFile } from "node:fs/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Scene } from "@babylonjs/core/scene.js";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { resetSkyCatalogForTesting, type SkyViewpoint } from "./sky-catalog.ts";
import { createStarfield, createStarGlare } from "./star-visuals.ts";

const VEGA: SkyViewpoint = {
  declinationDegrees: 38.783689,
  distanceParsecs: 7.678722,
  rightAscensionDegrees: 279.234735,
};

const serveBundledSky = async (): Promise<void> => {
  const file = await readFile(new URL("../public/sky/hyg-v44-vmag65.bin", import.meta.url));
  const asset = file.buffer.slice(
    file.byteOffset,
    file.byteOffset + file.byteLength,
  ) as ArrayBuffer;
  vi.stubGlobal("fetch", () => Promise.resolve(new Response(asset)));
};

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

let engine: NullEngine;
let scene: Scene;

beforeEach(() => {
  resetSkyCatalogForTesting();
  engine = new NullEngine({
    deterministicLockstep: false,
    lockstepMaxSteps: 4,
    renderHeight: 32,
    renderWidth: 32,
    textureSize: 32,
  });
  scene = new Scene(engine);
});

afterEach(() => {
  resetSkyCatalogForTesting();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  scene.dispose();
  engine.dispose();
});

test("a viewpoint gets the catalogue sky, capped by the device budget", async () => {
  await serveBundledSky();
  const starfield = createStarfield({ count: 800, scene, seed: 7, viewpoint: VEGA });

  expect(starfield.source()).toBe("pending");
  expect(starfield.mesh.getTotalVertices()).toBe(0);

  await settle();

  expect(starfield.source()).toBe("catalog");
  expect(starfield.mesh.getTotalVertices()).toBe(800);
  starfield.dispose();
});

test("no viewpoint means the seeded field, built before the call returns", () => {
  const starfield = createStarfield({ count: 64, scene, seed: 11, viewpoint: null });

  expect(starfield.source()).toBe("seeded");
  expect(starfield.mesh.getTotalVertices()).toBe(64);
  starfield.dispose();
});

test("the seeded field is reproducible from its seed and varies with it", () => {
  const readPositions = (seed: number): Float32Array => {
    const starfield = createStarfield({ count: 32, scene, seed, viewpoint: null });
    const positions = Float32Array.from(starfield.mesh.getVerticesData("position") ?? []);
    starfield.dispose();
    return positions;
  };

  expect(readPositions(4_242)).toEqual(readPositions(4_242));
  expect(readPositions(4_242)).not.toEqual(readPositions(4_243));
});

test("a star glare inherits the presentation scale used by tabletop AR", () => {
  const parent = new TransformNode("scaled-world", scene);
  parent.scaling.setAll(0.05);
  const glare = createStarGlare({
    color: Color3.White(),
    diameter: 2,
    intensity: 1,
    parent,
    position: Vector3.Zero(),
    scene,
    spikes: 0.5,
  });

  glare.update(0);
  const serialized = glare.mesh.material?.serialize() as {
    floats?: Record<string, number>;
  };
  expect(serialized.floats?.glareScale).toBeCloseTo(0.05);

  parent.scaling.setAll(0.2);
  glare.update(1);
  const resized = glare.mesh.material?.serialize() as {
    floats?: Record<string, number>;
  };
  expect(resized.floats?.glareScale).toBeCloseTo(0.2);
  glare.dispose();
  parent.dispose();
});

test("an unreachable catalogue falls back to the seeded field rather than an empty sky", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
  const starfield = createStarfield({ count: 128, scene, seed: 3, viewpoint: VEGA });

  await settle();

  expect(starfield.source()).toBe("seeded");
  expect(starfield.mesh.getTotalVertices()).toBe(128);
  starfield.dispose();
});

test("travelling away before the download lands leaves nothing to write to", async () => {
  await serveBundledSky();
  const starfield = createStarfield({ count: 128, scene, seed: 5, viewpoint: VEGA });
  starfield.mesh.dispose(false, true);

  await expect(settle()).resolves.toBeUndefined();
  expect(starfield.source()).toBe("pending");
});
