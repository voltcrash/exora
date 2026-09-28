import type { StarProfile } from "@exora/contracts";
import { expect, test } from "vite-plus/test";
import {
  absoluteMagnitude,
  hrPopulation,
  hrPosition,
  hrRegion,
  hrSubject,
  mainSequenceMagnitude,
  SUN,
} from "./hr-diagram.ts";
import type { SkyCatalog } from "./sky-catalog.ts";

test("a star at ten parsecs has an absolute magnitude equal to its apparent one", () => {
  expect(absoluteMagnitude(4.83, 10)).toBeCloseTo(4.83, 9);
  expect(absoluteMagnitude(0.03, 7.68)).toBeCloseTo(0.6, 1);
});

test("hot stars sit left and bright stars sit high", () => {
  const hot = hrPosition({ absoluteMagnitude: 0, temperatureKelvin: 20_000 })!;
  const cool = hrPosition({ absoluteMagnitude: 0, temperatureKelvin: 3_500 })!;
  const bright = hrPosition({ absoluteMagnitude: -5, temperatureKelvin: 5_000 })!;
  const faint = hrPosition({ absoluteMagnitude: 10, temperatureKelvin: 5_000 })!;

  expect(hot[0]).toBeLessThan(cool[0]);
  expect(bright[1]).toBeGreaterThan(faint[1]);
  expect(hrPosition({ absoluteMagnitude: 30, temperatureKelvin: 5_000 })).toBeNull();
});

test("familiar stars land in the regions they are known for", () => {
  expect(mainSequenceMagnitude(SUN.temperatureKelvin)).toBeCloseTo(4.8, 1);
  expect(hrRegion(SUN)).toBe("on the main sequence");
  expect(hrRegion({ absoluteMagnitude: -0.3, temperatureKelvin: 4_290 })).toBe("among the giants");
  expect(hrRegion({ absoluteMagnitude: -5.85, temperatureKelvin: 3_600 })).toBe(
    "among the supergiants",
  );
  expect(hrRegion({ absoluteMagnitude: -7.8, temperatureKelvin: 12_100 })).toBe(
    "among the supergiants",
  );
  expect(hrRegion({ absoluteMagnitude: 11.2, temperatureKelvin: 25_000 })).toBe(
    "among the white dwarfs",
  );
  expect(hrRegion({ absoluteMagnitude: 15.5, temperatureKelvin: 3_050 })).toBe(
    "on the main sequence",
  );
});

const star = (observation: Partial<StarProfile["observation"]>): StarProfile => ({
  catalogName: "* alf Boo",
  id: "arcturus",
  kind: "evolved",
  name: "Arcturus",
  objectType: "Red giant branch star",
  observation: {
    declinationDegrees: 19.18,
    distanceParsecs: 11.26,
    effectiveTemperatureKelvin: 4_286,
    gaiaMagnitude: null,
    parallaxMas: 88.83,
    properMotionDecMasPerYear: null,
    properMotionRaMasPerYear: null,
    radialVelocityKmPerSecond: null,
    rightAscensionDegrees: 213.9,
    spectralType: "K1.5III",
    visualMagnitude: -0.05,
    ...observation,
  },
  source: { archive: "SIMBAD", retrievedOn: "2026-09-28", tables: ["basic", "ident", "allfluxes"] },
});

test("a star is placed only from its own measured temperature, magnitude and distance", () => {
  expect(hrSubject(star({}))).toMatchObject({ temperatureKelvin: 4_286 });
  expect(hrSubject(star({}))!.absoluteMagnitude).toBeCloseTo(-0.31, 1);
  expect(hrSubject(star({ effectiveTemperatureKelvin: null }))).toBeNull();
  expect(hrSubject(star({ distanceParsecs: null }))).toBeNull();
});

test("the naked-eye population skips stars without a parallax", () => {
  const catalog: SkyCatalog = {
    colourIndex: Int16Array.from([650, 0, 1_500]),
    count: 3,
    distanceParsecs: Float32Array.from([10, 0, 150]),
    magnitudeLimit: 6.5,
    unitDirections: new Float32Array(9),
    visualMagnitude: Int16Array.from([4_830, 1_000, 3_000]),
  };
  const population = hrPopulation(catalog);

  expect(population.count).toBe(2);
  expect(population.colors).toHaveLength(9);
});
