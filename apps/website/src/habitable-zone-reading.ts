import type { ExoplanetProfile } from "@exora/contracts";
import {
  deriveHabitableZone,
  habitableZonePlacement,
  isWithinHabitableZone,
  type HabitableZonePlacement,
} from "@exora/worldgen";

const threeFigures = new Intl.NumberFormat("en", { maximumSignificantDigits: 3 });

export interface HabitableZoneReading {
  detail: string;
  placement: HabitableZonePlacement;
  value: string;
  within: boolean;
}

const PLACEMENT_VALUES: Record<HabitableZonePlacement, string> = {
  conservative: "Conservative zone",
  "optimistic-inner": "Optimistic inner edge",
  "optimistic-outer": "Optimistic outer edge",
  "too-cold": "Beyond the outer edge",
  "too-hot": "Inside the inner edge",
};

/** Reads a world's measured orbit against its host's derived habitable zone. */
export const readHabitableZone = (planet: ExoplanetProfile): HabitableZoneReading | null => {
  const semiMajorAxisAu = planet.observation.semiMajorAxisAu;
  if (semiMajorAxisAu === null || !Number.isFinite(semiMajorAxisAu) || semiMajorAxisAu <= 0) {
    return null;
  }
  const zone = deriveHabitableZone(planet.observation);
  if (!zone) return null;

  const placement = habitableZonePlacement(zone, semiMajorAxisAu);
  const flux = zone.luminositySolar / semiMajorAxisAu ** 2;
  return {
    detail: [
      `${threeFigures.format(zone.conservativeInnerAu)}–${threeFigures.format(zone.conservativeOuterAu)} AU conservative`,
      `${threeFigures.format(flux)}× Earth's stellar flux`,
      zone.extrapolated ? "Kopparapu 2014, extrapolated" : "Kopparapu 2014",
    ].join(" · "),
    placement,
    value: PLACEMENT_VALUES[placement],
    within: isWithinHabitableZone(placement),
  };
};
