import { deriveWorldRecipe } from "@exora/worldgen";
import { expect, test } from "vite-plus/test";
import {
  EARTH,
  MARS,
  MERCURY,
  SOLAR_SYSTEM_WORLDS,
  VENUS,
  tuneSolarWorldRecipe,
} from "./solar-system.ts";
import { SOLAR_SYSTEM_MOONS } from "./solar-moons.ts";
import { cloudDeckGeology, deriveSurfaceGeology, hasMeasuredGeology } from "./surface-geology.ts";

const geologyFor = (profile: Parameters<typeof tuneSolarWorldRecipe>[0]) => {
  const recipe = tuneSolarWorldRecipe(profile, deriveWorldRecipe(profile));
  const geology = deriveSurfaceGeology(
    recipe,
    profile.solarSystem
      ? {
          naifId: profile.solarSystem.naifId,
          ...(profile.solarSystem.surfaceStatus
            ? { surfaceStatus: profile.solarSystem.surfaceStatus }
            : {}),
        }
      : null,
  );
  if (!geology) throw new Error(`Expected ${profile.name} to be a rocky world with a geology.`);
  return { geology, recipe };
};

const moon = (name: string) => {
  const found = SOLAR_SYSTEM_MOONS.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Expected a ${name} profile.`);
  return found;
};

test("Mars reads as red rock, not ice, and carries no standing liquid", () => {
  const { geology, recipe } = geologyFor(MARS);

  expect(geology.provenance).toBe("measured");
  if (recipe.renderer !== "rocky") throw new Error("Expected a rocky recipe.");
  expect(recipe.surface.waterLevel).toBe(0);
  expect(geology.liquidLevel).toBeNull();

  for (const [red, green, blue] of geology.ramp) {
    expect(red).toBeGreaterThan(green);
    expect(green).toBeGreaterThan(blue);
  }
  expect(recipe.surface.midColor[0]).toBeGreaterThan(recipe.surface.midColor[2] * 2);
  expect(recipe.terrain.paletteFamily).toBe("oxidized-red");
});

test("Mars's provinces are the landforms Mars actually has", () => {
  const { geology } = geologyFor(MARS);
  const archetypes = geology.provinces.map((province) => province.archetype);

  expect(archetypes).toContain("dune-sea");
  expect(archetypes).toContain("canyon-rift");
  expect(archetypes).toContain("yardang-badlands");
  expect(archetypes).toContain("volcanic-shield");
  expect(geology.windStreaks).toBeGreaterThan(0.5);
});

test("crater density follows each body's measured resurfacing history", () => {
  const io = geologyFor(moon("Io")).geology;
  const europa = geologyFor(moon("Europa")).geology;
  const callisto = geologyFor(moon("Callisto")).geology;
  const venus = geologyFor(VENUS).geology;
  const mercury = geologyFor(MERCURY).geology;
  const earth = geologyFor(EARTH).geology;

  expect(io.craterDensity).toBe(0);
  expect(europa.craterDensity).toBeLessThan(0.1);
  expect(venus.craterDensity).toBeLessThan(0.1);
  expect(earth.craterDensity).toBeLessThan(0.05);
  expect(callisto.craterDensity).toBe(1);
  expect(mercury.craterDensity).toBeGreaterThan(0.9);
});

test("Europa's ground stays markedly flatter than a rocky planet's, as measured", () => {
  const europa = geologyFor(moon("Europa")).geology;
  const mars = geologyFor(MARS).geology;

  expect(europa.relief).toBeLessThan(mars.relief * 0.42);
  expect(europa.provinces[0]?.archetype).toBe("fractured-ice");
});

test("bodies differ from each other in province mix, not just in colour", () => {
  const bodies = [MERCURY, VENUS, EARTH, MARS, moon("Io"), moon("Europa"), moon("Titan")];
  const signatures = bodies.map((profile) =>
    geologyFor(profile)
      .geology.provinces.map((province) => province.archetype)
      .sort()
      .join("+"),
  );

  expect(new Set(signatures).size).toBe(bodies.length);
});

test("every measured body's province weights are normalized", () => {
  for (const profile of [MERCURY, VENUS, EARTH, MARS, moon("Io"), moon("Titan"), moon("Rhea")]) {
    const { geology } = geologyFor(profile);
    const total = geology.provinces.reduce((sum, province) => sum + province.weight, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(geology.provinces.length).toBeGreaterThan(0);
  }
});

test("unresolved bodies get no invented landforms", () => {
  const geology = deriveSurfaceGeology(deriveWorldRecipe(MARS), {
    naifId: 20_136_199,
    surfaceStatus: "unresolved",
  });
  if (!geology) throw new Error("Expected a geology.");

  expect(geology.provinces).toEqual([{ archetype: "regolith-plain", weight: 1 }]);
  expect(geology.craterDensity).toBe(0);
  expect(geology.boulderDensity).toBe(0);
  expect(geology.relief).toBeLessThan(1);
});

test("an exoplanet with no measured geology still resolves a complete, finite one", () => {
  const geology = deriveSurfaceGeology(deriveWorldRecipe(MARS), null);
  if (!geology) throw new Error("Expected a geology.");

  expect(geology.provenance).toBe("inferred");
  expect(hasMeasuredGeology(499)).toBe(true);
  expect(hasMeasuredGeology(-1)).toBe(false);
  for (const value of [
    geology.craterDensity,
    geology.relief,
    geology.featureScale,
    geology.regolithDepth,
    geology.boulderDensity,
    geology.hazeDensity,
    geology.strataStrength,
  ]) {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
  }
});

test("a giant has no ground to stand on and so has no geology", () => {
  const gasGiant = deriveWorldRecipe({
    ...MARS,
    id: "gas-giant-probe",
    kind: "gas-giant",
  });
  expect(deriveSurfaceGeology(gasGiant, null)).toBeNull();
});

test("a giant's excursion stands on cloud, with no rock in it anywhere", () => {
  const jupiter = SOLAR_SYSTEM_WORLDS.find((world) => world.name === "Jupiter");
  if (!jupiter) throw new Error("Expected a Jupiter profile.");
  const recipe = tuneSolarWorldRecipe(jupiter, deriveWorldRecipe(jupiter));
  const geology = cloudDeckGeology(recipe);
  if (!geology) throw new Error("Expected a cloud deck.");

  expect(geology.medium).toBe("cloud");
  expect(geology.craterDensity).toBe(0);
  expect(geology.boulderDensity).toBe(0);
  expect(geology.strataStrength).toBe(0);
  expect(geology.liquidLevel).toBeNull();
  expect(geology.detail.chemistryStrength).toBe(0);
  const [red, green, blue] = geology.ramp[4];
  expect(red).toBeGreaterThan(blue * 1.2);
  expect(green).toBeGreaterThan(blue);
});

test("a rocky world never resolves to a cloud deck, and every geology says which it is", () => {
  expect(cloudDeckGeology(tuneSolarWorldRecipe(MARS, deriveWorldRecipe(MARS)))).toBeNull();
  expect(geologyFor(MARS).geology.medium).toBe("rock");
  expect(geologyFor(MERCURY).geology.medium).toBe("rock");
});
