import type { StarProfile } from "@exora/contracts";
import { expect, test } from "vite-plus/test";
import { EARTH, JUPITER, MARS, MERCURY, SUN, VENUS } from "./solar-system.ts";
import { readStarHabitableZone } from "./star-habitable-zone.ts";

const simbadStar = (observation: Partial<StarProfile["observation"]>): StarProfile => ({
  ...SUN,
  customization: undefined,
  observation: { ...SUN.observation, ...observation },
  solarSystem: undefined,
  source: {
    archive: "SIMBAD",
    retrievedOn: "2026-09-27",
    tables: ["basic", "ident", "allfluxes"],
  },
});

test("counts the Sun's planets that orbit inside its zone", () => {
  const reading = readStarHabitableZone(SUN, [MERCURY, VENUS, EARTH, MARS, JUPITER]);

  expect(reading?.value).toBe("0.951–1.68 AU");
  expect(reading?.detail).toBe(
    "Optimistic 0.751–1.77 AU · 2 of 5 known orbits inside · measured 1 L☉ · Kopparapu 2014",
  );
});

test("falls back to the SIMBAD diameter and temperature without linked worlds", () => {
  const reading = readStarHabitableZone(
    simbadStar({ diameterKilometers: 1_391_400 * 2, effectiveTemperatureKelvin: 6_500 }),
    [],
  );

  expect(reading?.zone.luminositySource).toBe("derived");
  expect(reading?.detail).not.toContain("orbits inside");
  expect(reading?.zone.conservativeInnerAu).toBeGreaterThan(1.9);
});

test("stays silent when the star lacks what the fit needs", () => {
  expect(
    readStarHabitableZone(
      simbadStar({ diameterKilometers: null, effectiveTemperatureKelvin: 5_000 }),
      [],
    ),
  ).toBeNull();
  expect(readStarHabitableZone(simbadStar({ effectiveTemperatureKelvin: 25_000 }), [])).toBeNull();
});

test("skips generated stars", () => {
  const generated: StarProfile = {
    ...SUN,
    source: { archive: "Exora Custom Generator", retrievedOn: "2026-09-27", table: "procedural" },
  };
  expect(readStarHabitableZone(generated, [])).toBeNull();
});
