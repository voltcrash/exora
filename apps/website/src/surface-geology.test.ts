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

/**
 * The bug this guards: Mars's equilibrium temperature is 210 K, which the old ice threshold
 * (anything under 250 K) read as a glaciated world, so the surface vista painted the reddest
 * planet in the sky blue-white and gave it an ocean.
 */
test("Mars reads as red rock, not ice, and carries no standing liquid", () => {
  const { geology, recipe } = geologyFor(MARS);

  expect(geology.provenance).toBe("measured");
  if (recipe.renderer !== "rocky") throw new Error("Expected a rocky recipe.");
  expect(recipe.surface.waterLevel).toBe(0);
  expect(geology.liquidLevel).toBeNull();

  // Every stop on the ramp is warmer than it is cool: red above green above blue, throughout.
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

/** Resurfacing history is the single most distinctive fact about several of these surfaces, and
 * it shows up as a crater count. A renderer that sprinkles the same craters everywhere erases it. */
test("crater density follows each body's measured resurfacing history", () => {
  const io = geologyFor(moon("Io")).geology;
  const europa = geologyFor(moon("Europa")).geology;
  const callisto = geologyFor(moon("Callisto")).geology;
  const venus = geologyFor(VENUS).geology;
  const mercury = geologyFor(MERCURY).geology;
  const earth = geologyFor(EARTH).geology;

  // Io is repaved by its own volcanism faster than impacts can mark it: not one crater is known.
  expect(io.craterDensity).toBe(0);
  expect(europa.craterDensity).toBeLessThan(0.1);
  expect(venus.craterDensity).toBeLessThan(0.1);
  expect(earth.craterDensity).toBeLessThan(0.05);
  // Callisto is the other extreme: the most heavily cratered surface in the Solar System.
  expect(callisto.craterDensity).toBe(1);
  expect(mercury.craterDensity).toBeGreaterThan(0.9);
});

/**
 * Europa is the smoothest solid surface known, and the vista has to show that — but the figure
 * being compared is the scale of a landscape someone is standing in, not the body's global
 * relief. Globally Europa is thirty times flatter than Mars; stood on, its double ridges are real
 * topography, and the ground still has to read as markedly flatter rather than as featureless.
 */
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

/** A body no mission has resolved gets a deliberately featureless plain rather than an invented
 * landscape — the same rule the orbital view already follows for the same objects. */
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

/**
 * A giant has no ground, and the excursion has never pretended otherwise — what a visitor stands
 * on is the top of the convecting cloud layer whose bands the orbital view shows from above. It
 * shares the vista's geometry and light and none of its geology.
 */
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
  // Jupiter's own bands, not whichever family the inference happened to draw for it.
  const [red, green, blue] = geology.ramp[4];
  expect(red).toBeGreaterThan(blue * 1.2);
  expect(green).toBeGreaterThan(blue);
});

test("a rocky world never resolves to a cloud deck, and every geology says which it is", () => {
  expect(cloudDeckGeology(tuneSolarWorldRecipe(MARS, deriveWorldRecipe(MARS)))).toBeNull();
  expect(geologyFor(MARS).geology.medium).toBe("rock");
  expect(geologyFor(MERCURY).geology.medium).toBe("rock");
});
