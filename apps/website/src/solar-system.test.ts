import { describe, expect, it } from "vite-plus/test";
import {
  findSolarStar,
  findSolarSystem,
  findSolarWorld,
  SOLAR_SYSTEM_CATALOG,
  SOLAR_SYSTEM_PLANETS,
  SUN,
  tuneSolarWorldRecipe,
} from "./solar-system.ts";
import { deriveWorldRecipe } from "@exora/worldgen";

describe("the local Solar System catalog", () => {
  it("starts with the Sun under its permanent JPL identity", () => {
    expect(SOLAR_SYSTEM_CATALOG[0]).toEqual({ profile: SUN, type: "star" });
    expect(SUN.solarSystem).toMatchObject({ bodyType: "star", naifId: 10, parent: null });
    expect(SUN.source.archive).toBe("NASA/JPL Solar System Dynamics");
  });

  it("contains all eight planets in orbit order", () => {
    expect(SOLAR_SYSTEM_PLANETS.map(({ name }) => name)).toEqual([
      "Mercury",
      "Venus",
      "Earth",
      "Mars",
      "Jupiter",
      "Saturn",
      "Uranus",
      "Neptune",
    ]);
    expect(new Set(SOLAR_SYSTEM_PLANETS.map(({ solarSystem }) => solarSystem?.naifId)).size).toBe(
      8,
    );
    expect(findSolarWorld(" Earth ")?.solarSystem?.bodyType).toBe("planet");
  });

  it("builds the local Sun system without an archive request", () => {
    expect(findSolarSystem("sun")?.planets).toEqual(SOLAR_SYSTEM_PLANETS);
    expect(findSolarSystem("Kepler-297")).toBeNull();
  });

  it("uses measured tilts and recognisable ring systems instead of the exoplanet lottery", () => {
    const mercury = tuneSolarWorldRecipe(
      SOLAR_SYSTEM_PLANETS[0],
      deriveWorldRecipe(SOLAR_SYSTEM_PLANETS[0]),
    );
    const saturn = tuneSolarWorldRecipe(
      SOLAR_SYSTEM_PLANETS[5],
      deriveWorldRecipe(SOLAR_SYSTEM_PLANETS[5]),
    );
    expect(mercury.rings).toBeNull();
    expect(mercury.axialTilt).toBeCloseTo((0.034 * Math.PI) / 180);
    expect(saturn.rings?.outerRadius).toBeGreaterThan(saturn.radiusSceneUnits * 2);
    expect(saturn.confidence).toBe("high");
  });

  it("resolves the Sun without depending on SIMBAD", () => {
    expect(findSolarStar(" sun ")).toBe(SUN);
    expect(findSolarStar("Sol")).toBeNull();
  });
});
