import { expect, test } from "vite-plus/test";
import {
  findPlanetarySubsystem,
  PLANETARY_SUBSYSTEMS,
  subsystemOrbitRadius,
} from "./planetary-subsystems.ts";

test("every planet and Pluto has one dedicated subsystem definition", () => {
  expect(PLANETARY_SUBSYSTEMS.map((system) => system.parent)).toEqual([
    "Mercury",
    "Venus",
    "Earth",
    "Mars",
    "Jupiter",
    "Saturn",
    "Uranus",
    "Neptune",
    "Pluto",
  ]);
  expect(new Set(PLANETARY_SUBSYSTEMS.map((system) => system.parentNaifId)).size).toBe(9);
});

test("the authored systems cover minor moons, retrograde motion, shepherding, fields, and plumes", () => {
  const moons = PLANETARY_SUBSYSTEMS.flatMap((system) => system.moons);
  expect(moons.some((candidate) => !candidate.principal)).toBe(true);
  expect(moons.some((candidate) => candidate.retrograde)).toBe(true);
  expect(moons.some((candidate) => candidate.shepherds)).toBe(true);
  expect(PLANETARY_SUBSYSTEMS.some((system) => system.magnetosphere)).toBe(true);
  expect(PLANETARY_SUBSYSTEMS.flatMap((system) => system.plumes)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ evidence: "tentative", moon: "Europa" }),
      expect.objectContaining({ evidence: "confirmed", moon: "Enceladus" }),
    ]),
  );
});

test("orbit compression preserves measured parent-relative ordering", () => {
  const saturn = findPlanetarySubsystem("Saturn")!;
  const radii = saturn.moons.map((candidate) =>
    subsystemOrbitRadius(saturn, candidate.orbitalSemiMajorAxisKilometers),
  );
  expect(radii).toEqual([...radii].sort((left, right) => left - right));
  expect(radii.at(-1)).toBeGreaterThan(radii[0]!);
});

test("unresolved small moons never claim a mapped surface", () => {
  for (const system of PLANETARY_SUBSYSTEMS) {
    for (const candidate of system.moons) {
      if (candidate.surface === "unresolved") expect(candidate.texturePath).toBeUndefined();
    }
  }
});
