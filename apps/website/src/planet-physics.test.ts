import { expect, test } from "vite-plus/test";
import { featuredPlanet } from "./planet-profile.ts";
import { derivePlanetPhysics } from "./planet-physics.ts";

const earthLike = {
  ...featuredPlanet,
  kind: "rocky" as const,
  observation: {
    ...featuredPlanet.observation,
    massEarth: 1,
    massJupiter: null,
    orbitalPeriodDays: 365.25,
    radiusEarth: 1,
    radiusJupiter: null,
  },
};

test("an Earth twin reads back Earth's own gravity, escape velocity, and density", () => {
  const facts = derivePlanetPhysics(earthLike, {
    bulkDensityGCm3: 5.51,
    insolationEarthRelative: 1,
  });

  expect(facts.map(({ label, value }) => [label, value])).toEqual([
    ["Surface gravity", "1 g"],
    ["Escape velocity", "11.2 km/s"],
    ["Bulk density", "5.5 g/cm³"],
    ["Stellar flux", "1× Earth"],
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

  expect(facts[0]).toMatchObject({ label: "Cloud-top gravity", value: "2.5 g" });
  expect(facts.find(({ label }) => label === "Bulk density")?.detail).toMatch(/volatile envelope/);
  expect(facts.some(({ label }) => label === "Stellar flux")).toBe(false);
});

test("leaves out whatever the archive did not measure", () => {
  const facts = derivePlanetPhysics(
    {
      ...earthLike,
      observation: { ...earthLike.observation, massEarth: null, orbitalPeriodDays: null },
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
