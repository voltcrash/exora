import { describe, expect, it } from "vite-plus/test";
import {
  findSolarStar,
  findSolarSystem,
  findSolarWorld,
  SOLAR_SYSTEM_CATALOG,
  SOLAR_SYSTEM_CATALOG_GROUPS,
  SOLAR_SYSTEM_MOONS,
  SOLAR_SYSTEM_PLANETS,
  SOLAR_SYSTEM_WORLDS,
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
    expect(findSolarSystem("sun")?.planets).toEqual(SOLAR_SYSTEM_WORLDS);
    expect(findSolarSystem("Kepler-297")).toBeNull();
  });

  it("keeps Pluto after the eight planets as a dwarf planet", () => {
    const pluto = findSolarWorld("Pluto");
    expect(SOLAR_SYSTEM_WORLDS).toHaveLength(9);
    expect(SOLAR_SYSTEM_WORLDS.at(-1)).toBe(pluto);
    expect(pluto?.solarSystem).toMatchObject({ bodyType: "dwarf-planet", naifId: 999 });
    expect(pluto?.solarSystem?.texture?.path).toBe("/textures/solar-system/pluto.jpg");
  });

  it("catalogs every principal mission-mapped moon under its primary", () => {
    expect(SOLAR_SYSTEM_MOONS).toHaveLength(21);
    expect(SOLAR_SYSTEM_CATALOG).toHaveLength(31);
    expect(SOLAR_SYSTEM_CATALOG_GROUPS.map(({ label }) => label)).toEqual([
      "Sun · planets · dwarf planet",
      "Earth system · 1 mapped moon",
      "Mars system · 2 mapped moons",
      "Jupiter system · 4 mapped moons",
      "Saturn system · 7 mapped moons",
      "Uranus system · 5 mapped moons",
      "Neptune system · 1 mapped moon",
      "Pluto system · 1 mapped moon",
    ]);
    expect(new Set(SOLAR_SYSTEM_MOONS.map(({ solarSystem }) => solarSystem?.naifId)).size).toBe(21);
    expect(SOLAR_SYSTEM_MOONS.every(({ solarSystem }) => solarSystem?.texture)).toBe(true);
  });

  it("keeps local moon orbits separate from heliocentric lighting distance", () => {
    const europa = findSolarWorld("europa");
    expect(europa?.observation.semiMajorAxisAu).toBeCloseTo(5.2028);
    expect(europa?.solarSystem).toMatchObject({
      bodyType: "moon",
      naifId: 502,
      orbitalPeriodDays: 3.551181,
      orbitalSemiMajorAxisKilometers: 671_100,
      parent: "Jupiter",
    });
    expect(europa?.source.table).toBe("planetary-satellite-physical-parameters");
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

  it("tunes moon atmospheres from measured identities", () => {
    const titanProfile = findSolarWorld("Titan");
    const ioProfile = findSolarWorld("Io");
    expect(titanProfile).not.toBeNull();
    expect(ioProfile).not.toBeNull();
    if (!titanProfile || !ioProfile) return;

    const titan = tuneSolarWorldRecipe(titanProfile, deriveWorldRecipe(titanProfile));
    const io = tuneSolarWorldRecipe(ioProfile, deriveWorldRecipe(ioProfile));
    expect(titan.atmosphere.density).toBeGreaterThan(0.9);
    expect(titan.rings).toBeNull();
    expect(io.renderer).toBe("rocky");
    if (io.renderer === "rocky") expect(io.surface.lavaStrength).toBeGreaterThan(0);
  });

  it("resolves the Sun without depending on SIMBAD", () => {
    expect(findSolarStar(" sun ")).toBe(SUN);
    expect(findSolarStar("Sol")).toBeNull();
  });
});
