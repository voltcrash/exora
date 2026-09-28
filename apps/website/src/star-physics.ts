import type { StarProfile } from "@exora/contracts";

const SOLAR_DIAMETER_KILOMETERS = 1_391_400;
const SOLAR_TEMPERATURE_KELVIN = 5_772;
const WIEN_NANOMETER_KELVIN = 2_897_771.955;
const LIGHT_YEARS_PER_PARSEC = 3.261_563_8;
const SUN_ABSOLUTE_MAGNITUDE = 4.83;
const SUNLIGHT_MINUTES = 8.317;

export interface StarPhysicsFact {
  detail: string;
  label: string;
  unit?: string;
  value: string;
}

const threeFigures = new Intl.NumberFormat("en", { maximumSignificantDigits: 3 });
const twoDecimals = new Intl.NumberFormat("en", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const measured = (value: number | null | undefined): number | null =>
  value !== null && value !== undefined && Number.isFinite(value) && value > 0 ? value : null;

const spectralBand = (nanometers: number): string =>
  nanometers < 380
    ? "the ultraviolet"
    : nanometers < 450
      ? "violet"
      : nanometers < 495
        ? "blue"
        : nanometers < 570
          ? "green"
          : nanometers < 590
            ? "yellow"
            : nanometers < 620
              ? "orange"
              : nanometers < 750
                ? "red"
                : "the infrared";

// Distances carry about three significant figures, so far departures are dated to the century.
const departure = (lightYears: number, currentYear: number): string => {
  if (lightYears >= 5_000) {
    return `The light arriving tonight left ${threeFigures.format(lightYears)} years ago`;
  }
  const round = (year: number): number =>
    lightYears < 200 ? Math.round(year) : Math.round(year / 100) * 100;
  const year = currentYear - lightYears;
  return year >= 1
    ? `The light arriving tonight left around ${round(year)}`
    : `The light arriving tonight left around ${Math.max(round(1 - year), 1)} BCE`;
};

/**
 * Stellar quantities a reader can check by hand from the record's measured diameter,
 * temperature, magnitude and distance. A generated star has no record, so it gets none.
 */
export const deriveStarPhysics = (star: StarProfile, currentYear: number): StarPhysicsFact[] => {
  if (star.source.archive === "Exora Custom Generator") return [];
  const { observation } = star;
  const temperature = measured(observation.effectiveTemperatureKelvin);
  const diameter = measured(observation.diameterKilometers);
  const distance = measured(observation.distanceParsecs);
  const facts: StarPhysicsFact[] = [];

  if (temperature !== null && diameter !== null) {
    const radius = diameter / SOLAR_DIAMETER_KILOMETERS;
    facts.push({
      detail: `R² · (T / ${threeFigures.format(SOLAR_TEMPERATURE_KELVIN)} K)⁴ from the measured diameter and temperature`,
      label: "Luminosity",
      unit: "L☉",
      value: threeFigures.format(radius ** 2 * (temperature / SOLAR_TEMPERATURE_KELVIN) ** 4),
    });
  }

  if (temperature !== null) {
    const peak = WIEN_NANOMETER_KELVIN / temperature;
    facts.push({
      detail: `Wien's law · the spectrum peaks in ${spectralBand(peak)}`,
      label: "Peak emission",
      unit: "nm",
      value: threeFigures.format(peak),
    });
  }

  const magnitude = observation.visualMagnitude;
  if (distance !== null && magnitude !== null && Number.isFinite(magnitude)) {
    facts.push({
      detail: `How bright it would look from 10 parsecs · the Sun would be ${SUN_ABSOLUTE_MAGNITUDE}`,
      label: "Absolute magnitude",
      value: twoDecimals.format(magnitude - 5 * Math.log10(distance / 10)),
    });
  }

  if (star.solarSystem) {
    facts.push({
      detail: "Sunlight crosses one astronomical unit before it reaches Earth",
      label: "Light travel",
      unit: "minutes",
      value: threeFigures.format(SUNLIGHT_MINUTES),
    });
  } else if (distance !== null) {
    const lightYears = distance * LIGHT_YEARS_PER_PARSEC;
    facts.push({
      detail: departure(lightYears, currentYear),
      label: "Light travel",
      unit: "years",
      value: threeFigures.format(lightYears),
    });
  }

  return facts;
};
