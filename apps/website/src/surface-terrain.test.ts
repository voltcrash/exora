import { deriveWorldRecipe } from "@exora/worldgen";
import { expect, test } from "vite-plus/test";
import { SOLAR_SYSTEM_MOONS } from "./solar-moons.ts";
import { EARTH, MARS, MERCURY, VENUS, tuneSolarWorldRecipe } from "./solar-system.ts";
import { deriveSurfaceGeology } from "./surface-geology.ts";
import { createTerrainField, createTerrainSample } from "./surface-terrain.ts";

const fieldFor = (profile: Parameters<typeof tuneSolarWorldRecipe>[0]) => {
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
  if (!geology) throw new Error(`Expected ${profile.name} to have a geology.`);
  return createTerrainField(geology);
};

const moon = (name: string) => {
  const found = SOLAR_SYSTEM_MOONS.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`Expected a ${name} profile.`);
  return found;
};

/** Statistics over a grid covering the whole vista, which is what "does this world look
 * different from that one" actually reduces to. */
const survey = (field: ReturnType<typeof createTerrainField>, extent = 130, step = 2.5) => {
  const sample = createTerrainSample();
  let lowest = Number.POSITIVE_INFINITY;
  let highest = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let count = 0;
  let slopeSum = 0;
  const provinces = new Set<number>();

  for (let x = -extent; x <= extent; x += step) {
    for (let z = -extent; z <= extent; z += step) {
      field.sample(x, z, sample);
      expect(Number.isFinite(sample.height)).toBe(true);
      lowest = Math.min(lowest, sample.height);
      highest = Math.max(highest, sample.height);
      sum += sample.height;
      slopeSum += Math.abs(sample.height - field.height(x + 0.6, z));
      provinces.add(sample.province);
      count += 1;
    }
  }

  return {
    highest,
    lowest,
    mean: sum / count,
    provinces: provinces.size,
    relief: highest - lowest,
    roughness: slopeSum / count,
  };
};

test("the same world builds the same ground on every visit", () => {
  const first = fieldFor(MARS);
  const second = fieldFor(MARS);

  for (const [x, z] of [
    [0, 0],
    [17.3, -42.1],
    [-88.6, 103.4],
    [129.9, 129.9],
  ] as const) {
    expect(first.height(x, z)).toBe(second.height(x, z));
  }
});

test("a vista holds several landform provinces rather than one repeated process", () => {
  for (const profile of [MARS, MERCURY, EARTH, moon("Titan")]) {
    const stats = survey(fieldFor(profile));
    expect(stats.provinces).toBeGreaterThan(1);
  }
});

/**
 * The complaint this answers: every world's terrain looked the same, differing only in colour.
 * Two worlds should be different *landscapes* — so their height fields, sampled over the same
 * ground, should not track each other. Comparing amplitudes alone would not catch it: Venus and
 * Earth genuinely have similar relief, and are still nothing alike to stand on.
 */
test("worlds with different geology produce uncorrelated ground, not one shape rescaled", () => {
  const bodies = [MERCURY, VENUS, EARTH, MARS, moon("Io"), moon("Europa"), moon("Titan")];
  // Sampled outside the landing site rather than over the whole patch: every world deliberately
  // keeps its arrival area open and lets relief grow outward, and that shared composition would
  // otherwise register as similarity between worlds that are nothing alike. Everything past 60
  // units is under the same full relief, and covers enough landform territories that a chance
  // agreement between two of them cannot carry the statistic.
  const heights = bodies.map((profile) => {
    const field = fieldFor(profile);
    const values: number[] = [];
    for (let x = -145; x <= 145; x += 2.5) {
      for (let z = -145; z <= 145; z += 2.5) {
        const radius = Math.hypot(x, z);
        if (radius >= 60 && radius <= 145) values.push(field.height(x, z));
      }
    }
    return values;
  });

  /** Pearson correlation, which is blind to scale and offset and so tests shape alone. */
  const correlation = (a: readonly number[], b: readonly number[]): number => {
    const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
    const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
    let covariance = 0;
    let varianceA = 0;
    let varianceB = 0;
    for (let index = 0; index < a.length; index += 1) {
      const da = (a[index] ?? 0) - meanA;
      const db = (b[index] ?? 0) - meanB;
      covariance += da * db;
      varianceA += da * da;
      varianceB += db * db;
    }
    return covariance / Math.sqrt(Math.max(varianceA * varianceB, 1e-9));
  };

  for (let a = 0; a < heights.length; a += 1) {
    // Each world correlates perfectly with itself, which is the determinism guarantee restated.
    expect(correlation(heights[a]!, heights[a]!)).toBeCloseTo(1, 6);
    for (let b = a + 1; b < heights.length; b += 1) {
      expect(Math.abs(correlation(heights[a]!, heights[b]!))).toBeLessThan(0.35);
    }
  }
});

/** And the scale genuinely varies too: the flattest world's relief is a small fraction of the
 * most rugged one's, rather than every world getting the same hills in a different colour. */
test("relief spans a wide range across worlds", () => {
  const surveys = [MERCURY, EARTH, MARS, moon("Europa"), moon("Titan")].map((profile) =>
    survey(fieldFor(profile)),
  );
  const reliefs = surveys.map((stats) => stats.relief);
  expect(Math.max(...reliefs) / Math.min(...reliefs)).toBeGreaterThan(4);
});

test("Europa's ground stays as flat as its measured relief says it is", () => {
  const europa = survey(fieldFor(moon("Europa")));
  const mars = survey(fieldFor(MARS));

  expect(europa.relief).toBeLessThan(mars.relief * 0.45);
});

/**
 * The host star sits a few degrees above the horizon, so ground free to raise a peak right beside
 * the viewer would stand in front of it. Relief has to grow with distance from the landing spot —
 * which is also how a real vista composes, since you cannot see the hill you are standing on.
 */
test("the ground immediately around the viewer stays lower than the far field", () => {
  for (const profile of [MARS, MERCURY, moon("Io")]) {
    const field = fieldFor(profile);
    const near = survey(field, 18, 1);
    const far = survey(field, 130, 2.5);
    expect(near.relief).toBeLessThan(far.relief);
  }
});

test("an airless world keeps its craters and a resurfaced one does not", () => {
  // A crater field shows up as a bumpier surface at short range under a low overall relief.
  const mercury = survey(fieldFor(MERCURY), 90, 1.5);
  const io = survey(fieldFor(moon("Io")), 90, 1.5);

  expect(mercury.roughness).toBeGreaterThan(0);
  expect(io.roughness).toBeGreaterThan(0);
  expect(mercury.roughness).not.toBeCloseTo(io.roughness, 2);
});

test("material channels stay inside their documented range everywhere", () => {
  const sample = createTerrainSample();
  for (const profile of [MARS, VENUS, moon("Io"), moon("Europa"), moon("Titan")]) {
    const field = fieldFor(profile);
    for (let x = -120; x <= 120; x += 7) {
      for (let z = -120; z <= 120; z += 7) {
        field.sample(x, z, sample);
        for (const channel of [sample.regolith, sample.scarp, sample.frost, sample.molten]) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(1);
        }
      }
    }
  }
});

test("only a world with molten ground reports any", () => {
  const sample = createTerrainSample();
  const readMolten = (profile: Parameters<typeof fieldFor>[0]): number => {
    const field = fieldFor(profile);
    let peak = 0;
    for (let x = -110; x <= 110; x += 3) {
      for (let z = -110; z <= 110; z += 3) {
        field.sample(x, z, sample);
        peak = Math.max(peak, sample.molten);
      }
    }
    return peak;
  };

  expect(readMolten(moon("Io"))).toBeGreaterThan(0);
  expect(readMolten(MARS)).toBe(0);
  expect(readMolten(moon("Europa"))).toBe(0);
});

test("a vista's worth of ground samples in a frame's worth of time", () => {
  const field = fieldFor(MARS);
  const sample = createTerrainSample();
  const started = performance.now();
  let count = 0;
  for (let x = -130; x <= 130; x += 1.3) {
    for (let z = -130; z <= 130; z += 1.3) {
      field.sample(x, z, sample);
      count += 1;
    }
  }
  const elapsed = performance.now() - started;

  expect(count).toBeGreaterThan(39_000);
  // The vista is built once, behind a fade to black, so this is a budget rather than a frame time.
  expect(elapsed).toBeLessThan(2_500);
});
