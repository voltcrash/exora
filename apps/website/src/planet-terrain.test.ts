import { expect, test } from "vite-plus/test";
import type { RockyTerrainDetail } from "@exora/worldgen";
import {
  buildCraterField,
  fbm3,
  gradientNoise3,
  ridged3,
  sampleTerrainHeight,
  worley3,
} from "./planet-terrain.ts";

const terrain: RockyTerrainDetail = {
  atmosphereDensity: 0.5,
  cloudCoverage: 0.4,
  continentalFragmentation: 0.55,
  continentalScale: 0.6,
  craterDensity: 0.5,
  craterScale: 0.5,
  erosionAmount: 0.3,
  iceCoverage: 0.2,
  lavaCoverage: 0.1,
  mountainCoverage: 0.5,
  mountainHeight: 0.6,
  oceanCoverage: 0.45,
  paletteFamily: "silicate-neutral",
  polarIceBias: 0.5,
  terrainRoughness: 0.4,
  volcanicActivity: 0.1,
};

test("gradientNoise3 is deterministic for the same inputs", () => {
  const a = gradientNoise3(1.234, 5.678, -2.5, 42);
  const b = gradientNoise3(1.234, 5.678, -2.5, 42);
  expect(a).toBe(b);
});

test("fbm3, ridged3, worley3 stay bounded and finite", () => {
  for (let i = 0; i < 50; i += 1) {
    const x = Math.sin(i) * 3;
    const y = Math.cos(i * 1.7) * 3;
    const z = Math.sin(i * 0.3) * 3;
    expect(Number.isFinite(fbm3(x, y, z, 7, { octaves: 4 }))).toBe(true);
    expect(Number.isFinite(ridged3(x, y, z, 7, { octaves: 4 }))).toBe(true);
    const w = worley3(x, y, z, 7);
    expect(Number.isFinite(w)).toBe(true);
    expect(w).toBeGreaterThanOrEqual(0);
  }
});

test("buildCraterField is deterministic for a fixed seed", () => {
  const a = buildCraterField(99, 0.5, 0.5);
  const b = buildCraterField(99, 0.5, 0.5);
  expect(a).toEqual(b);
});

test("buildCraterField placement is not latitude-biased", () => {
  const craters = buildCraterField(12345, 1, 0.5);
  expect(craters.length).toBeGreaterThan(10);
  const polar = craters.filter((c) => Math.abs(c.direction.y) > 0.8).length;
  const equatorial = craters.filter((c) => Math.abs(c.direction.y) < 0.3).length;
  // Uniform sphere sampling should not systematically starve either band.
  expect(polar).toBeLessThan(craters.length);
  expect(equatorial).toBeGreaterThan(0);
});

test("sampleTerrainHeight is deterministic for a fixed seed and direction", () => {
  const craters = buildCraterField(555, terrain.craterDensity, terrain.craterScale);
  const direction = { x: 0.577, y: 0.577, z: 0.577 };
  const a = sampleTerrainHeight(direction, terrain, 555, craters);
  const b = sampleTerrainHeight(direction, terrain, 555, craters);
  expect(a.height).toBe(b.height);
  expect(Number.isFinite(a.height)).toBe(true);
});

test("sampleTerrainHeight differs across seeds", () => {
  const craters1 = buildCraterField(1, terrain.craterDensity, terrain.craterScale);
  const craters2 = buildCraterField(2, terrain.craterDensity, terrain.craterScale);
  const direction = { x: 0, y: 1, z: 0 };
  const a = sampleTerrainHeight(direction, terrain, 1, craters1);
  const b = sampleTerrainHeight(direction, terrain, 2, craters2);
  expect(a.height).not.toBe(b.height);
});

test("sampleTerrainHeight has no pole singularity", () => {
  const craters = buildCraterField(321, terrain.craterDensity, terrain.craterScale);
  const northPole = sampleTerrainHeight({ x: 0, y: 1, z: 0 }, terrain, 321, craters);
  const nearPole = sampleTerrainHeight({ x: 0.01, y: 0.9999, z: 0.01 }, terrain, 321, craters);
  expect(Number.isFinite(northPole.height)).toBe(true);
  expect(Number.isFinite(nearPole.height)).toBe(true);
  expect(Math.abs(northPole.height - nearPole.height)).toBeLessThan(0.5);
});
