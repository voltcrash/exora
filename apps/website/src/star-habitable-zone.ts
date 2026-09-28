import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import {
  deriveHabitableZone,
  habitableZonePlacement,
  isWithinHabitableZone,
  type HabitableZone,
} from "@exora/worldgen";

const SOLAR_DIAMETER_KILOMETERS = 1_391_400;
const threeFigures = new Intl.NumberFormat("en", { maximumSignificantDigits: 3 });

export interface StarHabitableZoneReading {
  detail: string;
  value: string;
  zone: HabitableZone;
}

const range = (inner: number, outer: number): string =>
  `${threeFigures.format(inner)}–${threeFigures.format(outer)} AU`;

// The archive host record is preferred so the star page agrees with its worlds' pages.
const zoneFor = (star: StarProfile, worlds: readonly ExoplanetProfile[]): HabitableZone | null => {
  for (const world of worlds) {
    const zone = deriveHabitableZone(world.observation);
    if (zone) return zone;
  }
  const diameter = star.observation.diameterKilometers ?? null;
  return deriveHabitableZone({
    hostLuminosityLogSolar: null,
    hostRadiusSolar: diameter === null ? null : diameter / SOLAR_DIAMETER_KILOMETERS,
    hostTemperatureKelvin: star.observation.effectiveTemperatureKelvin ?? null,
  });
};

/** Reads a star's habitable zone and how many of its linked worlds orbit inside it. */
export const readStarHabitableZone = (
  star: StarProfile,
  worlds: readonly ExoplanetProfile[],
): StarHabitableZoneReading | null => {
  if (star.source.archive === "Exora Custom Generator") return null;
  const zone = zoneFor(star, worlds);
  if (!zone) return null;

  const orbits = worlds
    .map(({ observation }) => observation.semiMajorAxisAu)
    .filter((au): au is number => au !== null && Number.isFinite(au) && au > 0);
  const inside = orbits.filter((au) =>
    isWithinHabitableZone(habitableZonePlacement(zone, au)),
  ).length;

  return {
    detail: [
      `Optimistic ${range(zone.optimisticInnerAu, zone.optimisticOuterAu)}`,
      orbits.length > 0 &&
        `${inside} of ${orbits.length} known ${orbits.length === 1 ? "orbit" : "orbits"} inside`,
      `${zone.luminositySource === "measured" ? "measured" : "derived"} ${threeFigures.format(zone.luminositySolar)} L☉`,
      zone.extrapolated ? "Kopparapu 2014, extrapolated" : "Kopparapu 2014",
    ]
      .filter(Boolean)
      .join(" · "),
    value: range(zone.conservativeInnerAu, zone.conservativeOuterAu),
    zone,
  };
};
