import { expect, test } from "vite-plus/test";
import { findSolarRegion, sampleRegionParticles, SOLAR_SYSTEM_REGIONS } from "./solar-regions.ts";

test("the regional collection contains every requested Solar System structure", () => {
  expect(SOLAR_SYSTEM_REGIONS.map((region) => region.name)).toEqual([
    "Main Asteroid Belt",
    "Jupiter Trojan Clouds",
    "Kuiper Belt",
    "Scattered Disk",
    "Oort Cloud",
    "Heliosphere",
    "Termination Shock",
    "Heliopause",
  ]);
});

test("every region records its evidence class, scale, parent identity, and authoritative sources", () => {
  for (const region of SOLAR_SYSTEM_REGIONS) {
    expect(region.parent).toBe("Sun");
    expect(region.anchorNaifId).toMatch(/^\d+$/u);
    expect(region.anchorSpkId).toMatch(/^\d+$/u);
    expect(region.distanceAu.outer).toBeGreaterThan(region.distanceAu.inner);
    expect(region.disclosure.length).toBeGreaterThan(60);
    expect(region.sources.length).toBeGreaterThan(0);
    for (const source of region.sources) {
      expect(source.datasetId.length).toBeGreaterThan(8);
      expect(source.originalUrl).toMatch(/^https:\/\//u);
      expect(source.retrievedOn).toBe("2026-08-23");
    }
  }
});

test("the Oort Cloud is never presented as observed", () => {
  const oort = findSolarRegion("Öpik-Oort cloud")!;
  expect(oort.evidence).toBe("modeled-inferred");
  expect(oort.disclosure).toContain("NOT DIRECTLY OBSERVED");
  expect(oort.summary).toContain("hypothesized");
});

test("statistical samples are deterministic and deliberately lack catalogue identities", () => {
  const belt = findSolarRegion("main belt")!;
  const first = sampleRegionParticles(belt, 24);
  expect(sampleRegionParticles(belt, 24)).toEqual(first);
  expect(first).toHaveLength(24);
  expect(first.every((particle) => !("id" in particle))).toBe(true);
});

test("Jupiter Trojan samples retain distinct leading and trailing clouds", () => {
  const trojans = findSolarRegion("trojans")!;
  const particles = sampleRegionParticles(trojans, 20);
  expect(particles.filter((particle) => particle.cloud === "leading")).toHaveLength(10);
  expect(particles.filter((particle) => particle.cloud === "trailing")).toHaveLength(10);
});

test("measured-boundary samples remain on the normalized shell instead of extrapolating inward", () => {
  const heliopause = findSolarRegion("heliopause")!;
  const particles = sampleRegionParticles(heliopause, 200);
  const radii = particles.map((particle) => Math.hypot(particle.x, particle.z));
  expect(Math.max(...radii)).toBeLessThanOrEqual(12);
  expect(Math.min(...radii)).toBeGreaterThanOrEqual(4);
});
