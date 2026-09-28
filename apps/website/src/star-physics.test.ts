import type { StarProfile } from "@exora/contracts";
import { expect, test } from "vite-plus/test";
import { SUN } from "./solar-system.ts";
import { deriveStarPhysics } from "./star-physics.ts";

const simbadStar = (observation: Partial<StarProfile["observation"]>): StarProfile => ({
  ...SUN,
  customization: undefined,
  observation: { ...SUN.observation, ...observation },
  solarSystem: undefined,
  source: { archive: "SIMBAD", retrievedOn: "2026-09-28", tables: ["basic", "ident", "allfluxes"] },
});

const byLabel = (facts: ReturnType<typeof deriveStarPhysics>) =>
  Object.fromEntries(facts.map((fact) => [fact.label, fact]));

test("the Sun reads back its own luminosity, green peak and eight-minute light", () => {
  const facts = byLabel(deriveStarPhysics(SUN, 2026));

  expect(facts.Luminosity).toMatchObject({ unit: "L☉", value: "1" });
  expect(facts["Peak emission"]).toMatchObject({ unit: "nm", value: "502" });
  expect(facts["Peak emission"]?.detail).toMatch(/peaks in green$/);
  expect(facts["Light travel"]).toMatchObject({ unit: "minutes", value: "8.32" });
  expect(facts["Absolute magnitude"]).toBeUndefined();
});

test("Sirius's catalog magnitude and parallax give its known absolute magnitude", () => {
  const facts = byLabel(
    deriveStarPhysics(
      simbadStar({
        diameterKilometers: 2_381_000,
        distanceParsecs: 2.637,
        effectiveTemperatureKelvin: 9_940,
        visualMagnitude: -1.46,
      }),
      2026,
    ),
  );

  expect(facts["Absolute magnitude"]?.value).toBe("1.43");
  expect(facts["Light travel"]).toMatchObject({ unit: "years", value: "8.6" });
  expect(facts["Light travel"]?.detail).toBe("The light arriving tonight left around 2017");
  expect(facts["Peak emission"]?.detail).toMatch(/the ultraviolet$/);
});

test("distant light is dated before the common era, then in plain years", () => {
  const travel = (distanceParsecs: number) =>
    byLabel(deriveStarPhysics(simbadStar({ distanceParsecs }), 2026))["Light travel"]?.detail;

  expect(travel(100)).toBe("The light arriving tonight left around 1700");
  expect(travel(1_000)).toBe("The light arriving tonight left around 1200 BCE");
  expect(travel(10_000)).toBe("The light arriving tonight left 32,600 years ago");
});

test("missing measurements leave their facts out, and generated stars have none", () => {
  expect(
    deriveStarPhysics(
      simbadStar({
        diameterKilometers: null,
        distanceParsecs: null,
        effectiveTemperatureKelvin: null,
      }),
      2026,
    ),
  ).toEqual([]);
  expect(
    deriveStarPhysics(
      {
        ...SUN,
        source: {
          archive: "Exora Custom Generator",
          retrievedOn: "2026-09-28",
          table: "procedural",
        },
      },
      2026,
    ),
  ).toEqual([]);
});
