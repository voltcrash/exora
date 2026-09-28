import type { BlackHoleProfile } from "@exora/contracts";

// SI values; the Schwarzschild radius of one solar mass is 2GM☉/c².
const SOLAR_GRAVITATIONAL_PARAMETER = 1.327_124_4e20;
const SCHWARZSCHILD_METERS_PER_SOLAR_MASS = 2_953.25;
const SOLAR_MASS_KILOGRAMS = 1.988_92e30;
const HAWKING_KELVIN_SOLAR_MASS = 6.169e-8;
const COSMIC_BACKGROUND_KELVIN = 2.725;
const METERS_PER_LIGHT_YEAR = 9.460_730_472_580_8e15;
const METERS_PER_AU = 1.495_978_707e11;
const STANDARD_GRAVITY = 9.806_65;
const MICROARCSECONDS_PER_RADIAN = (180 / Math.PI) * 3_600e6;
const AIR_DENSITY = 1.2;
const WATER_DENSITY = 1_000;
const BODY_LENGTH_METERS = 2;
// Tidal stretch around 10 g is where a human body is taken to fail.
const LETHAL_TIDAL_G = 10;

export interface BlackHoleFact {
  detail: string;
  label: string;
  unit: string;
  value: string;
}

const SUPERSCRIPTS: Record<string, string> = {
  "-": "⁻",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

const threeFigures = new Intl.NumberFormat("en", { maximumSignificantDigits: 3 });

export const formatMagnitude = (value: number): string => {
  const size = Math.abs(value);
  if (size === 0 || (size >= 1e-3 && size < 1e6)) return threeFigures.format(value);
  const exponent = Math.floor(Math.log10(size));
  const mantissa = Number((value / 10 ** exponent).toPrecision(2));
  const power = String(exponent).replaceAll(/[-\d]/g, (digit) => SUPERSCRIPTS[digit] ?? digit);
  return `${mantissa} × 10${power}`;
};

const measureLength = (meters: number): { unit: string; value: string } => {
  const au = meters / METERS_PER_AU;
  if (au >= 0.1) return { unit: "AU", value: formatMagnitude(au) };
  return { unit: "km", value: formatMagnitude(meters / 1_000) };
};

const formatLength = (meters: number): string => {
  const { unit, value } = measureLength(meters);
  return `${value} ${unit}`;
};

const formatDuration = (seconds: number): string => {
  if (seconds < 1) return `${threeFigures.format(seconds * 1_000)} ms`;
  if (seconds < 120) return `${threeFigures.format(seconds)} s`;
  if (seconds < 7_200) return `${threeFigures.format(seconds / 60)} min`;
  if (seconds < 172_800) return `${threeFigures.format(seconds / 3_600)} h`;
  if (seconds < 3.156e7 * 2) return `${threeFigures.format(seconds / 86_400)} days`;
  return `${threeFigures.format(seconds / 3.156e7)} years`;
};

const densityReading = (density: number): string => {
  if (density < AIR_DENSITY) return "thinner than the air you breathe";
  if (density < WATER_DENSITY) return "lighter than water";
  if (density < 2e4) return "about as dense as ordinary solids";
  return "far denser than any ordinary matter";
};

/**
 * Consequences of general relativity for a non-spinning hole of the catalog mass. Returns an
 * empty list rather than guessing when the mass is unknown.
 */
export const deriveBlackHolePhysics = (blackHole: BlackHoleProfile): BlackHoleFact[] => {
  const mass = blackHole.massSolar;
  if (mass === null || !Number.isFinite(mass) || mass <= 0) return [];

  const horizon = SCHWARZSCHILD_METERS_PER_SOLAR_MASS * mass;
  const gravitationalParameter = SOLAR_GRAVITATIONAL_PARAMETER * mass;
  const facts: BlackHoleFact[] = [];

  const distance = blackHole.distanceLightYears;
  if (distance !== null && Number.isFinite(distance) && distance > 0) {
    const angle = (Math.sqrt(27) * horizon) / (distance * METERS_PER_LIGHT_YEAR);
    facts.push({
      detail: "Angular width of the shadow, √27 Schwarzschild radii, at the catalog distance",
      label: "Shadow from Earth",
      unit: "µas",
      value: formatMagnitude(angle * MICROARCSECONDS_PER_RADIAN),
    });
  }

  const isco = 3 * horizon;
  const iscoPeriod = 2 * Math.PI * Math.sqrt(isco ** 3 / gravitationalParameter);
  facts.push({
    detail: `Three Schwarzschild radii · one lap every ${formatDuration(iscoPeriod)}`,
    label: "Innermost stable orbit",
    ...measureLength(isco),
  });

  facts.push({
    detail: `Light can circle here, unstably · ${formatLength(horizon)} horizon radius`,
    label: "Photon sphere",
    ...measureLength(1.5 * horizon),
  });

  const stretch = (2 * gravitationalParameter * BODY_LENGTH_METERS) / horizon ** 3;
  const lethalRadius = Math.cbrt(
    (2 * gravitationalParameter * BODY_LENGTH_METERS) / (LETHAL_TIDAL_G * STANDARD_GRAVITY),
  );
  facts.push({
    detail:
      lethalRadius <= horizon
        ? "Stretch across a 2 m body at the horizon · you would cross it intact"
        : `Stretch across a 2 m body at the horizon · lethal from ${formatLength(lethalRadius)} out, ${threeFigures.format(lethalRadius / horizon)}× the horizon`,
    label: "Horizon tides",
    unit: "g",
    value: formatMagnitude(stretch / STANDARD_GRAVITY),
  });

  const density = (mass * SOLAR_MASS_KILOGRAMS) / ((4 / 3) * Math.PI * horizon ** 3);
  facts.push({
    detail: `Mass averaged over the horizon's volume · ${densityReading(density)}`,
    label: "Mean density",
    unit: "kg/m³",
    value: formatMagnitude(density),
  });

  const hawking = HAWKING_KELVIN_SOLAR_MASS / mass;
  facts.push({
    detail:
      hawking < COSMIC_BACKGROUND_KELVIN
        ? "Colder than the 2.7 K microwave background, so it absorbs more than it radiates"
        : "Hotter than the microwave background, so it slowly evaporates",
    label: "Hawking temperature",
    unit: "K",
    value: formatMagnitude(hawking),
  });

  return facts;
};
