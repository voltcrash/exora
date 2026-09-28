import type { ExoplanetProfile } from "@exora/contracts";
import { expect, test } from "vite-plus/test";
import { readHabitableZone } from "./habitable-zone-reading.ts";

const trappist = (name: string, semiMajorAxisAu: number | null): ExoplanetProfile => ({
  hostStar: "TRAPPIST-1",
  id: name.toLowerCase().replaceAll(" ", "-"),
  kind: "rocky",
  name,
  observation: {
    declinationDegrees: -5.04,
    discoveryMethod: "Transit",
    discoveryYear: 2017,
    distanceParsecs: 12.4,
    equilibriumTemperatureKelvin: 250,
    hostLuminosityLogSolar: -3.26,
    hostMassSolar: 0.09,
    hostRadiusSolar: 0.12,
    hostSpectralType: "M8 V",
    hostTemperatureKelvin: 2_566,
    massEarth: 0.69,
    massJupiter: null,
    orbitalEccentricity: 0.005,
    orbitalInclinationDegrees: 89.7,
    orbitalPeriodDays: 6.1,
    radiusEarth: 0.92,
    radiusJupiter: null,
    rightAscensionDegrees: 346.6,
    semiMajorAxisAu,
  },
  source: { archive: "NASA Exoplanet Archive", retrievedOn: "2026-09-27", table: "pscomppars" },
});

test("reads a temperate world as inside the conservative zone with its stellar flux", () => {
  const reading = readHabitableZone(trappist("TRAPPIST-1 e", 0.0293));

  expect(reading).toEqual({
    detail:
      "0.0245–0.0497 AU conservative · 0.64× Earth's stellar flux · Kopparapu 2014, extrapolated",
    placement: "conservative",
    value: "Conservative zone",
    within: true,
  });
});

test("reads worlds on either side of the zone as outside it", () => {
  expect(readHabitableZone(trappist("TRAPPIST-1 b", 0.0115))?.value).toBe("Inside the inner edge");
  expect(readHabitableZone(trappist("TRAPPIST-1 h", 0.0619))?.within).toBe(false);
});

test("gives no reading without a measured orbit", () => {
  expect(readHabitableZone(trappist("TRAPPIST-1 x", null))).toBeNull();
});
