import { expect, test } from "vite-plus/test";
import { featuredPlanet } from "./planet-profile.ts";
import { derivePlanetPhysics } from "./planet-physics.ts";

const shown = ({ unit, value }: { unit?: string; value: string }): string =>
  unit ? `${value} ${unit}` : value;

const earthLike = {
  ...featuredPlanet,
  kind: "rocky" as const,
  observation: {
    ...featuredPlanet.observation,
    massEarth: 1,
    hostRadiusSolar: 1,
    massJupiter: null,
    orbitalPeriodDays: 365.25,
    radiusEarth: 1,
    radiusJupiter: null,
    semiMajorAxisAu: 1,
  },
};

test("an Earth twin reads back Earth's own gravity, escape velocity, and density", () => {
  const facts = derivePlanetPhysics(earthLike, {
    bulkDensityGCm3: 5.51,
    insolationEarthRelative: 1,
  });

  expect(facts.map((fact) => [fact.label, shown(fact)])).toEqual([
    ["Surface gravity", "1 g"],
    ["Escape velocity", "11.2 km/s"],
    ["Bulk density", "5.5 g/cm³"],
    ["Stellar flux", "1× Earth"],
    ["Star in the sky", "0.533°"],
    ["Year", "365 days"],
  ]);
});

test("giants report gravity at the cloud tops and a low density as a volatile envelope", () => {
  const facts = derivePlanetPhysics(
    {
      ...featuredPlanet,
      kind: "gas-giant",
      observation: {
        ...featuredPlanet.observation,
        massEarth: null,
        massJupiter: 1,
        radiusEarth: null,
        radiusJupiter: 1,
      },
    },
    { bulkDensityGCm3: 1.33, insolationEarthRelative: null },
  );

  expect(facts[0]).toMatchObject({ label: "Cloud-top gravity", unit: "g", value: "2.5" });
  expect(facts.find(({ label }) => label === "Bulk density")?.detail).toMatch(/volatile envelope/);
  expect(facts.some(({ label }) => label === "Stellar flux")).toBe(false);
});

test("leaves out whatever the archive did not measure", () => {
  const facts = derivePlanetPhysics(
    {
      ...earthLike,
      observation: {
        ...earthLike.observation,
        massEarth: null,
        orbitalPeriodDays: null,
        semiMajorAxisAu: null,
      },
    },
    { bulkDensityGCm3: null, insolationEarthRelative: null },
  );

  expect(facts).toEqual([]);
});

test("states very short and very long years in their natural units", () => {
  const year = (orbitalPeriodDays: number) =>
    derivePlanetPhysics(
      { ...earthLike, observation: { ...earthLike.observation, orbitalPeriodDays } },
      { bulkDensityGCm3: null, insolationEarthRelative: null },
    ).find(({ label }) => label === "Year");

  expect(year(0.35)?.detail).toMatch(/^8\.4 hours/);
  expect(year(4_333)?.detail).toMatch(/^11\.9 Earth years/);
});

test("a close orbit around a small star sees it swell across the sky", () => {
  const sky = derivePlanetPhysics(
    {
      ...earthLike,
      observation: { ...earthLike.observation, hostRadiusSolar: 0.119, semiMajorAxisAu: 0.0293 },
    },
    { bulkDensityGCm3: null, insolationEarthRelative: null },
  ).find(({ label }) => label === "Star in the sky");

  expect(sky).toMatchObject({ value: "2.16°" });
  expect(sky?.detail).toMatch(/^4\.06× the Sun's width/);
});
