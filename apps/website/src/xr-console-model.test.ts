import { expect, test } from "vite-plus/test";
import type { CustomPlanetParameters, CustomStarParameters } from "@exora/worldgen";
import {
  adjustPlanetField,
  adjustStarField,
  applyKeyStroke,
  cycle,
  KEYBOARD_ROWS,
  paginate,
  PLANET_FORGE_FIELDS,
  PLANET_FORGE_KINDS,
  STAR_FORGE_FIELDS,
} from "./xr-console-model.ts";

const planet: CustomPlanetParameters = {
  activity: 0.5,
  atmosphere: 0.5,
  axialTilt: 0.5,
  baseColor: [0.2, 0.4, 0.6],
  kind: "rocky",
  name: "Asteria",
  radius: 0.98,
  rings: false,
  rotation: 0.5,
  seed: 12,
  temperatureKelvin: 2_390,
  water: 0.5,
};

const star: CustomStarParameters = {
  activity: 0.5,
  kind: "main-sequence",
  name: "Solara",
  radius: 0.02,
  rotation: 0.5,
  seed: 7,
  temperatureKelvin: 5_772,
};

const planetField = (key: string) => {
  const field = PLANET_FORGE_FIELDS.find((candidate) => candidate.key === key);
  if (!field) throw new Error(`Unknown planet field ${key}`);
  return field;
};

test("types into the query and edits it back out", () => {
  expect(applyKeyStroke("KEPLER", "-")).toBe("KEPLER-");
  expect(applyKeyStroke("KEPLER-22", "␣")).toBe("KEPLER-22 ");
  expect(applyKeyStroke("KEPLER-22 B", "⌫")).toBe("KEPLER-22 ");
  expect(applyKeyStroke("KEPLER-22 B", "⌦")).toBe("");
  expect(applyKeyStroke("ABC", "D", 3)).toBe("ABC");
});

test("keyboard rows are ten keys wide so the grid stays square", () => {
  for (const row of KEYBOARD_ROWS) expect(row).toHaveLength(10);
});

test("clamps a forge parameter at both ends of its range", () => {
  const radius = planetField("radius");
  expect(adjustPlanetField(planet, radius, 1).radius).toBe(1);
  expect(adjustPlanetField({ ...planet, radius: 0.02 }, radius, -1).radius).toBe(0);

  const temperature = planetField("temperatureKelvin");
  expect(adjustPlanetField(planet, temperature, 1).temperatureKelvin).toBe(2_400);
  expect(adjustPlanetField(planet, temperature, -1).temperatureKelvin).toBe(2_350);

  const scale = STAR_FORGE_FIELDS.find((field) => field.key === "radius");
  expect(scale && adjustStarField(star, scale, -1).radius).toBe(0);
});

test("leaves the other parameters untouched when one is stepped", () => {
  const adjusted = adjustPlanetField(planet, planetField("activity"), 1);
  expect(adjusted.activity).toBe(0.55);
  expect(adjusted.name).toBe(planet.name);
  expect(adjusted.radius).toBe(planet.radius);
  expect(planet.activity).toBe(0.5);
});

test("hides surface water on worlds that cannot have any", () => {
  const water = planetField("water");
  expect(water.visible?.(planet)).toBe(true);
  expect(water.visible?.({ ...planet, kind: "gas-giant" })).toBe(false);
  expect(water.format({ ...planet, temperatureKelvin: 900 })).toBe("VAPORIZED");
});

test("cycles a choice list in both directions and wraps", () => {
  expect(cycle(PLANET_FORGE_KINDS, "rocky", 1)).toBe("ice-giant");
  expect(cycle(PLANET_FORGE_KINDS, "gas-giant", 1)).toBe("rocky");
  expect(cycle(PLANET_FORGE_KINDS, "rocky", -1)).toBe("gas-giant");
});

test("paginates results and clamps a page index into range", () => {
  const items = Array.from({ length: 13 }, (_, index) => index);
  expect(paginate(items, 0, 6)).toEqual({ items: [0, 1, 2, 3, 4, 5], page: 0, pageCount: 3 });
  expect(paginate(items, 2, 6).items).toEqual([12]);
  expect(paginate(items, 9, 6).page).toBe(2);
  expect(paginate([], 3, 6)).toEqual({ items: [], page: 0, pageCount: 1 });
});
