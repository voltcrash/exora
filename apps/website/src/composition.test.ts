import type { ExoplanetProfile } from "@exora/contracts";
import { expect, test } from "vite-plus/test";
import {
  compositionFacts,
  earthSimilarityIndex,
  readComposition,
  zengRockyRadius,
} from "./composition.ts";
import { featuredPlanet } from "./planet-profile.ts";

const rocky = (
  massEarth: number,
  radiusEarth: number,
  provenance: Partial<ExoplanetProfile["observation"]> = {},
): ExoplanetProfile => ({
  ...featuredPlanet,
  kind: "rocky",
  observation: {
    ...featuredPlanet.observation,
    massEarth,
    massJupiter: null,
    massProvenance: "measured",
    radiusEarth,
    radiusJupiter: null,
    radiusProvenance: "measured",
    ...provenance,
  },
});

test("Earth's own mass and radius give back its one-third iron core", () => {
  expect(zengRockyRadius(1, 0.33)).toBeCloseTo(1, 2);
  expect(readComposition(rocky(1, 1), 255)?.coreMassFraction).toBeCloseTo(0.33, 2);
});

test("Earth is exactly Earth-like on every axis of the similarity index", () => {
  expect(earthSimilarityIndex(1, 1, 255)).toEqual({ global: 1, interior: 1, surface: 1 });
  expect(earthSimilarityIndex(1, 1, 700).global).toBeLessThan(0.5);
});

test("a world too big for rock and iron is read as volatile-rich", () => {
  const reading = readComposition(rocky(5, 2.5), 500);

  expect(reading?.coreMassFractionVerdict).toBe("needs-volatiles");
  expect(compositionFacts(reading)[0]).toMatchObject({ value: "None · volatile-rich" });
});

test("a world smaller than pure iron allows says so rather than printing over 100%", () => {
  const reading = readComposition(rocky(2, 1), 900);

  expect(reading).toMatchObject({
    coreMassFraction: 1,
    coreMassFractionVerdict: "denser-than-iron",
  });
});

test("the fit is not extrapolated beyond one to eight Earth masses", () => {
  expect(readComposition(rocky(0.107, 0.532), 210)?.coreMassFraction).toBeNull();
  expect(readComposition(rocky(12, 1.9), 900)?.coreMassFraction).toBeNull();
});

test("an estimated radius or a minimum mass withholds the interior reading", () => {
  expect(readComposition(rocky(2, 1.2, { radiusProvenance: "estimated" }), 300)).toMatchObject({
    coreMassFraction: null,
    earthSimilarity: null,
    radiusEstimated: true,
  });
  expect(readComposition(rocky(2, 1.2, { massProvenance: "minimum" }), 300)).toMatchObject({
    coreMassFraction: null,
    massLowerBound: true,
  });
});
