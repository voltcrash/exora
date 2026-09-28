// Kopparapu et al. (2014, ApJL 787 L29), Table 1, one-Earth-mass planet:
// Seff = SeffSun + a·T + b·T² + c·T³ + d·T⁴ with T = Teff − 5780 K.
interface FluxLimitCoefficients {
  a: number;
  b: number;
  c: number;
  d: number;
  solarFlux: number;
}

const RECENT_VENUS: FluxLimitCoefficients = {
  solarFlux: 1.776,
  a: 2.136e-4,
  b: 2.533e-8,
  c: -1.332e-11,
  d: -3.097e-15,
};
const RUNAWAY_GREENHOUSE: FluxLimitCoefficients = {
  solarFlux: 1.107,
  a: 1.332e-4,
  b: 1.58e-8,
  c: -8.308e-12,
  d: -1.931e-15,
};
const MAXIMUM_GREENHOUSE: FluxLimitCoefficients = {
  solarFlux: 0.356,
  a: 6.171e-5,
  b: 1.698e-9,
  c: -3.198e-12,
  d: -5.575e-16,
};
const EARLY_MARS: FluxLimitCoefficients = {
  solarFlux: 0.32,
  a: 5.547e-5,
  b: 1.526e-9,
  c: -2.874e-12,
  d: -5.011e-16,
};

const REFERENCE_TEMPERATURE_KELVIN = 5_780;
const SOLAR_TEMPERATURE_KELVIN = 5_772;

/** Effective temperatures the published fit was calibrated over. */
export const HABITABLE_ZONE_CALIBRATED_KELVIN = [2_600, 7_200] as const;
// Beyond these the polynomial is meaningless, so no zone is reported at all.
const HABITABLE_ZONE_SUPPORTED_KELVIN = [2_000, 10_000] as const;

export interface HabitableZoneInputs {
  hostLuminosityLogSolar: number | null;
  hostRadiusSolar: number | null;
  hostTemperatureKelvin: number | null;
}

export interface HabitableZone {
  /** Runaway-greenhouse limit. */
  conservativeInnerAu: number;
  /** Maximum-greenhouse limit. */
  conservativeOuterAu: number;
  /** True when the host lies outside the fit's calibrated temperature range. */
  extrapolated: boolean;
  luminositySolar: number;
  luminositySource: "derived" | "measured";
  /** Recent-Venus limit. */
  optimisticInnerAu: number;
  /** Early-Mars limit. */
  optimisticOuterAu: number;
  temperatureKelvin: number;
}

export type HabitableZonePlacement =
  | "conservative"
  | "optimistic-inner"
  | "optimistic-outer"
  | "too-cold"
  | "too-hot";

const finitePositive = (value: number | null): number | null =>
  value !== null && Number.isFinite(value) && value > 0 ? value : null;

const effectiveFlux = (limit: FluxLimitCoefficients, temperatureKelvin: number): number => {
  const offset = temperatureKelvin - REFERENCE_TEMPERATURE_KELVIN;
  return (
    limit.solarFlux +
    limit.a * offset +
    limit.b * offset ** 2 +
    limit.c * offset ** 3 +
    limit.d * offset ** 4
  );
};

const hostLuminositySolar = (
  inputs: HabitableZoneInputs,
  temperatureKelvin: number,
): { source: HabitableZone["luminositySource"]; value: number } | null => {
  const logLuminosity = inputs.hostLuminosityLogSolar;
  if (logLuminosity !== null && Number.isFinite(logLuminosity)) {
    return { source: "measured", value: 10 ** logLuminosity };
  }
  const radius = finitePositive(inputs.hostRadiusSolar);
  if (radius === null) return null;
  return {
    source: "derived",
    value: radius ** 2 * (temperatureKelvin / SOLAR_TEMPERATURE_KELVIN) ** 4,
  };
};

/**
 * Derives the circumstellar habitable zone from the host's measured temperature and
 * luminosity, falling back to Stefan–Boltzmann from radius when luminosity is absent.
 * Returns `null` rather than guessing when the catalog lacks what the fit needs.
 */
export const deriveHabitableZone = (inputs: HabitableZoneInputs): HabitableZone | null => {
  const temperatureKelvin = finitePositive(inputs.hostTemperatureKelvin);
  if (
    temperatureKelvin === null ||
    temperatureKelvin < HABITABLE_ZONE_SUPPORTED_KELVIN[0] ||
    temperatureKelvin > HABITABLE_ZONE_SUPPORTED_KELVIN[1]
  ) {
    return null;
  }

  const luminosity = hostLuminositySolar(inputs, temperatureKelvin);
  if (luminosity === null || !Number.isFinite(luminosity.value) || luminosity.value <= 0) {
    return null;
  }

  const [calibratedMinimum, calibratedMaximum] = HABITABLE_ZONE_CALIBRATED_KELVIN;
  const fitTemperature = Math.min(
    calibratedMaximum,
    Math.max(calibratedMinimum, temperatureKelvin),
  );
  const distanceAu = (limit: FluxLimitCoefficients): number =>
    Math.sqrt(luminosity.value / effectiveFlux(limit, fitTemperature));

  return {
    conservativeInnerAu: distanceAu(RUNAWAY_GREENHOUSE),
    conservativeOuterAu: distanceAu(MAXIMUM_GREENHOUSE),
    extrapolated: fitTemperature !== temperatureKelvin,
    luminositySolar: luminosity.value,
    luminositySource: luminosity.source,
    optimisticInnerAu: distanceAu(RECENT_VENUS),
    optimisticOuterAu: distanceAu(EARLY_MARS),
    temperatureKelvin,
  };
};

export const habitableZonePlacement = (
  zone: HabitableZone,
  semiMajorAxisAu: number,
): HabitableZonePlacement => {
  if (semiMajorAxisAu < zone.optimisticInnerAu) return "too-hot";
  if (semiMajorAxisAu < zone.conservativeInnerAu) return "optimistic-inner";
  if (semiMajorAxisAu <= zone.conservativeOuterAu) return "conservative";
  if (semiMajorAxisAu <= zone.optimisticOuterAu) return "optimistic-outer";
  return "too-cold";
};

export const isWithinHabitableZone = (placement: HabitableZonePlacement): boolean =>
  placement !== "too-cold" && placement !== "too-hot";
