import { expect, test } from "vite-plus/test";
import { validateIrregularBodyDescriptor } from "./irregular-body.ts";
import {
  asteroidSystemMembers,
  findSolarAsteroid,
  SOLAR_SYSTEM_ASTEROIDS,
} from "./solar-asteroids.ts";

test("the authored collection contains all nine requested asteroid systems", () => {
  const featured = SOLAR_SYSTEM_ASTEROIDS.filter((asteroid) => asteroid.featuredSystem);
  expect(featured.map((asteroid) => asteroid.name)).toEqual([
    "4 Vesta",
    "101955 Bennu",
    "162173 Ryugu",
    "433 Eros",
    "25143 Itokawa",
    "243 Ida",
    "65803 Didymos",
    "16 Psyche",
    "99942 Apophis",
  ]);
  expect(SOLAR_SYSTEM_ASTEROIDS).toHaveLength(11);
});

test("every asteroid keeps permanent identity, parent, evidence, and uncertainty metadata", () => {
  for (const asteroid of SOLAR_SYSTEM_ASTEROIDS) {
    expect(asteroid.spkId).toMatch(/^\d+$/u);
    expect(Number.isFinite(asteroid.naifId)).toBe(true);
    expect(asteroid.parent.length).toBeGreaterThan(0);
    expect(asteroid.uncertaintyNote.length).toBeGreaterThan(20);
    if (asteroid.source.api.includes("SBDB")) expect(asteroid.source.apiVersion).toBe("1.3");
    expect(validateIrregularBodyDescriptor(asteroid.descriptor)).toEqual([]);
  }
});

test("mission models are plate geometry while honestly unresolved bodies keep dimensions only", () => {
  for (const name of [
    "Vesta",
    "Bennu",
    "Ryugu",
    "Eros",
    "Itokawa",
    "Ida",
    "Didymos",
    "Dimorphos",
  ]) {
    expect(findSolarAsteroid(name)?.descriptor.shapeModel?.lods[0]?.triangleCount).toBeGreaterThan(
      10_000,
    );
  }
  for (const name of ["Dactyl", "Psyche", "Apophis"]) {
    expect(findSolarAsteroid(name)?.descriptor.shapeModel).toBeUndefined();
    expect(findSolarAsteroid(name)?.evidence.surface).toBe("unresolved");
  }
});

test("binary companions retain direct-parent navigation and permanent satellite identifiers", () => {
  expect(asteroidSystemMembers(findSolarAsteroid("Ida")!).map((body) => body.name)).toEqual([
    "Dactyl",
  ]);
  expect(asteroidSystemMembers(findSolarAsteroid("Didymos")!).map((body) => body.name)).toEqual([
    "Dimorphos",
  ]);
  expect(findSolarAsteroid("Dactyl")?.naifId).toBe(2_431_011);
  expect(findSolarAsteroid("Dimorphos")?.naifId).toBe(120_065_803);
});

test("Apophis presents the JPL close-approach solution as an uncertainty interval", () => {
  const approach = findSolarAsteroid("99942 Apophis")?.closeApproach;
  expect(approach?.minimumAu).toBeLessThan(approach!.distanceAu);
  expect(approach?.maximumAu).toBeGreaterThan(approach!.distanceAu);
  expect(approach?.date).toBe("2029-04-13");
});
