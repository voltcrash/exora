import {
  WORLDGEN_VERSION,
  type CustomBlackHoleParameters,
  type CustomPlanetParameters,
} from "@exora/worldgen";
import { expect, test } from "vite-plus/test";
import {
  customBlackHoleUrl,
  customPlanetUrl,
  customStarUrl,
  parseCustomBlackHoleUrl,
  parseCustomPlanetUrl,
  parseCustomStarUrl,
} from "./custom-destination-url.ts";

const blackHole: CustomBlackHoleParameters = {
  diskActivity: 0.72,
  diskHueDegrees: 28,
  diskTiltDegrees: 62,
  jetStrength: 0.46,
  kind: "supermassive",
  mass: 0.48,
  name: "Nyx Ω",
  seed: 88_021,
};

const planet: CustomPlanetParameters = {
  activity: 0.64,
  atmosphere: 0.58,
  axialTilt: 0.56,
  baseColor: [0.12, 0.54, 0.68],
  kind: "rocky",
  name: "Asteria β",
  radius: 0.52,
  rings: false,
  rotation: 0.46,
  seed: 7_319,
  temperatureKelvin: 286,
  water: 0.56,
};

const encodeTestRecipe = (recipe: unknown): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(recipe));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

test("custom destination recipes round-trip Unicode Forge inputs", () => {
  const blackHoleValue = new URLSearchParams(customBlackHoleUrl(blackHole)).get("customBlackHole");
  const planetValue = new URLSearchParams(customPlanetUrl(planet)).get("custom");
  const starValue = new URLSearchParams(
    customStarUrl({
      activity: 0.68,
      kind: "main-sequence",
      name: "Solara α",
      radius: 0.55,
      rotation: 0.42,
      seed: 42_017,
      temperatureKelvin: 5_772,
    }),
  ).get("customStar");

  expect(parseCustomBlackHoleUrl(blackHoleValue!)).toEqual(blackHole);
  expect(parseCustomPlanetUrl(planetValue!)).toEqual(planet);
  expect(parseCustomStarUrl(starValue!)).toMatchObject({ name: "Solara α", seed: 42_017 });
});

test("malformed, oversized, and invalid custom recipes are rejected", () => {
  expect(parseCustomPlanetUrl("not+base64")).toBeNull();
  expect(parseCustomPlanetUrl("a".repeat(2_049))).toBeNull();

  const invalidShape = encodeTestRecipe({
    parameters: { ...planet, radius: "huge" },
    type: "planet",
    version: WORLDGEN_VERSION,
  });
  expect(parseCustomPlanetUrl(invalidShape)).toBeNull();
});

test("recipes from another worldgen version fail closed", () => {
  const previousVersion = encodeTestRecipe({
    parameters: planet,
    type: "planet",
    version: WORLDGEN_VERSION - 1,
  });

  expect(parseCustomPlanetUrl(previousVersion)).toBeNull();
});
