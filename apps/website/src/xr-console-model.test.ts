import type { ExoplanetProfile } from "@exora/contracts";
import { expect, test } from "vite-plus/test";
import type { CustomPlanetParameters, CustomStarParameters } from "@exora/worldgen";
import { deriveSystemLayout } from "./system-layout.ts";
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
  systemFacts,
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

const systemWorld = (
  name: string,
  observation: Partial<ExoplanetProfile["observation"]>,
): ExoplanetProfile => ({
  id: name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"),
  name,
  hostStar: "Console Host",
  kind: "rocky",
  observation: {
    declinationDegrees: 12,
    distanceParsecs: 40,
    discoveryMethod: "Transit",
    discoveryYear: 2020,
    equilibriumTemperatureKelvin: 280,
    hostLuminosityLogSolar: -0.5,
    hostMassSolar: 0.8,
    hostRadiusSolar: 0.78,
    hostSpectralType: "K2V",
    hostTemperatureKelvin: 4_900,
    massEarth: 1,
    massJupiter: null,
    orbitalEccentricity: null,
    orbitalInclinationDegrees: null,
    orbitalPeriodDays: null,
    radiusEarth: 1,
    radiusJupiter: null,
    rightAscensionDegrees: 88,
    semiMajorAxisAu: null,
    ...observation,
  },
  source: { archive: "NASA Exoplanet Archive", retrievedOn: "2026-08-22", table: "pscomppars" },
});

test("the headset readout states what the diorama compressed, not only what was measured", () => {
  const layout = deriveSystemLayout([
    systemWorld("Console b", { orbitalPeriodDays: 6, semiMajorAxisAu: 0.06 }),
    systemWorld("Console c", { orbitalPeriodDays: 90, semiMajorAxisAu: 0.4 }),
  ]);

  const facts = systemFacts("Console Host", layout);
  const labels = facts.map(({ label }) => label);

  // The three compressions are given the same standing as the measurements, because a reader
  // inside the headset cannot check the layout against anything else.
  expect(labels).toContain("Orbit scale");
  expect(labels).toContain("Body scale");
  expect(labels).toContain("Clock");
  expect(facts.find(({ label }) => label === "Orbit scale")?.value).toContain("LOG");
  expect(facts.find(({ label }) => label === "Worlds drawn")?.value).toBe("2 of 2");
  // Nothing was left unplaced, so nothing claims to have been.
  expect(labels).not.toContain("Not placed");
});

test("a world the diorama could not place is named in the headset rather than dropped", () => {
  const layout = deriveSystemLayout([
    systemWorld("Console b", { orbitalPeriodDays: 6, semiMajorAxisAu: 0.06 }),
    systemWorld("Console d", { hostMassSolar: null }),
  ]);

  const facts = systemFacts("Console Host", layout);

  expect(facts.find(({ label }) => label === "Worlds drawn")?.value).toBe("1 of 2");
  expect(facts.find(({ label }) => label === "Not placed")?.value).toBe("Console d");
});

test("the host radius carries the tier it came from, so an assumed star is not read as measured", () => {
  const measured = deriveSystemLayout([systemWorld("Console b", { semiMajorAxisAu: 0.2 })]);
  const assumed = deriveSystemLayout([
    systemWorld("Console b", { hostMassSolar: null, hostRadiusSolar: null, semiMajorAxisAu: 0.2 }),
  ]);

  expect(
    systemFacts("Console Host", measured).find(({ label }) => label === "Host radius")?.value,
  ).toContain("measured");
  expect(
    systemFacts("Console Host", assumed).find(({ label }) => label === "Host radius")?.value,
  ).toContain("assumed");
});
