import type { ExoplanetProfile } from "@exora/contracts";
import { expect, test } from "vite-plus/test";
import { deriveTidalLocking } from "../src/index.ts";

const world = (
  kind: ExoplanetProfile["kind"],
  observation: Partial<ExoplanetProfile["observation"]>,
): ExoplanetProfile => ({
  hostStar: "Host",
  id: "world",
  kind,
  name: "World b",
  observation: {
    declinationDegrees: null,
    discoveryMethod: "Transit",
    discoveryYear: 2020,
    distanceParsecs: 10,
    equilibriumTemperatureKelvin: null,
    hostLuminosityLogSolar: null,
    hostMassSolar: 1,
    hostRadiusSolar: 1,
    hostSpectralType: null,
    hostTemperatureKelvin: 5_772,
    massEarth: 1,
    massJupiter: null,
    orbitalEccentricity: null,
    orbitalInclinationDegrees: null,
    orbitalPeriodDays: 365.25,
    radiusEarth: 1,
    radiusJupiter: null,
    rightAscensionDegrees: null,
    semiMajorAxisAu: 1,
    ...observation,
  },
  source: { archive: "NASA Exoplanet Archive", retrievedOn: "2026-09-27", table: "pscomppars" },
});

test("an Earth twin at 1 AU keeps its own day", () => {
  const locking = deriveTidalLocking(world("rocky", {}));

  expect(locking?.locked).toBe(false);
  expect(locking?.despinTimescaleYears).toBeGreaterThan(1e10);
  expect(locking?.rotationPeriodDays).toBeNull();
});

test("TRAPPIST-1 e despins within millennia and turns once per orbit", () => {
  const locking = deriveTidalLocking(
    world("rocky", {
      hostMassSolar: 0.0898,
      massEarth: 0.692,
      orbitalPeriodDays: 6.1,
      radiusEarth: 0.92,
      semiMajorAxisAu: 0.02925,
    }),
  );

  expect(locking?.locked).toBe(true);
  expect(locking?.despinTimescaleYears).toBeLessThan(1e5);
  expect(locking?.rotationPeriodDays).toBe(6.1);
  expect(locking?.sizeSource).toBe("measured");
});

test("a hot Jupiter locks while a Jupiter at 5 AU does not", () => {
  const hot = world("gas-giant", {
    massEarth: null,
    massJupiter: 0.46,
    orbitalPeriodDays: 4.23,
    radiusEarth: null,
    radiusJupiter: 1.2,
    semiMajorAxisAu: 0.052,
  });

  expect(deriveTidalLocking(hot)?.locked).toBe(true);
  expect(
    deriveTidalLocking({
      ...hot,
      observation: { ...hot.observation, orbitalPeriodDays: 4_333, semiMajorAxisAu: 5.2 },
    })?.locked,
  ).toBe(false);
});

test("fills a missing orbit size from the period and a missing mass from a typical density", () => {
  const locking = deriveTidalLocking(
    world("rocky", {
      hostMassSolar: 0.09,
      massEarth: null,
      orbitalPeriodDays: 4,
      semiMajorAxisAu: null,
    }),
  );

  expect(locking?.locked).toBe(true);
  expect(locking?.sizeSource).toBe("derived");
  expect(locking?.rotationPeriodDays).toBe(4);
});

test("says nothing when the archive cannot anchor the estimate", () => {
  expect(deriveTidalLocking(world("rocky", { hostMassSolar: null }))).toBeNull();
  expect(
    deriveTidalLocking(world("rocky", { orbitalPeriodDays: null, semiMajorAxisAu: null })),
  ).toBeNull();
  expect(
    deriveTidalLocking(
      world("rocky", {
        massEarth: null,
        massJupiter: null,
        radiusEarth: null,
        radiusJupiter: null,
      }),
    ),
  ).toBeNull();
  expect(
    deriveTidalLocking({
      ...world("rocky", {}),
      solarSystem: {
        axialTiltDegrees: 23.44,
        bodyType: "planet",
        naifId: 399,
        orbitalInclinationDegrees: 0,
        parent: "Sun",
        rotationPeriodHours: 23.93,
        summary: "Home.",
      },
    }),
  ).toBeNull();
});
