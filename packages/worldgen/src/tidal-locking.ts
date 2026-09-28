import type { ExoplanetProfile } from "@exora/contracts";

const GRAVITATIONAL_CONSTANT = 6.674e-11;
const SOLAR_MASS_KG = 1.989e30;
const EARTH_MASS_KG = 5.972e24;
const EARTH_RADIUS_M = 6.371e6;
const EARTH_RADII_PER_JUPITER_RADIUS = 11.209;
const EARTH_MASSES_PER_JUPITER_MASS = 317.83;
const AU_M = 1.495978707e11;
const SECONDS_PER_YEAR = 3.15576e7;
const DAYS_PER_YEAR = 365.25;
// A ten-hour primordial day; the a⁶ dependence swamps any reasonable choice here.
const INITIAL_SPIN_RADIANS_PER_SECOND = (2 * Math.PI) / (10 * 3_600);

/** Worlds that despin faster than this are taken to be locked by now. */
export const TIDAL_LOCK_THRESHOLD_YEARS = 1e9;

interface TidalResponse {
  /** Bulk density used only when the archive reports a radius but no mass, or the reverse. */
  densityGCm3: number;
  loveNumber: number;
  momentOfInertiaFactor: number;
  qualityFactor: number;
}

// Constant-Q parameters of the kind used for Solar System analogues: rocky bodies dissipate
// strongly (Q ~ 100), fluid giants weakly (Q ~ 10⁴–10⁵).
const TIDAL_RESPONSE: Record<ExoplanetProfile["kind"], TidalResponse> = {
  "gas-giant": {
    densityGCm3: 1.3,
    loveNumber: 0.5,
    momentOfInertiaFactor: 0.25,
    qualityFactor: 1e5,
  },
  "ice-giant": {
    densityGCm3: 1.6,
    loveNumber: 0.4,
    momentOfInertiaFactor: 0.23,
    qualityFactor: 1e4,
  },
  rocky: { densityGCm3: 5.5, loveNumber: 0.3, momentOfInertiaFactor: 0.33, qualityFactor: 100 },
  unknown: { densityGCm3: 5.5, loveNumber: 0.3, momentOfInertiaFactor: 0.33, qualityFactor: 100 },
};

const EARTH_DENSITY_G_CM3 = 5.51;

export interface TidalLocking {
  despinTimescaleYears: number;
  locked: boolean;
  /** Synchronous sidereal day, equal to the orbital period, when locked. */
  rotationPeriodDays: number | null;
  /** Whether the planet's mass or radius had to be filled in from a typical density. */
  sizeSource: "derived" | "measured";
}

const positive = (value: number | null): number | null =>
  value !== null && Number.isFinite(value) && value > 0 ? value : null;

const planetSize = (
  planet: ExoplanetProfile,
): { massEarth: number; radiusEarth: number; source: TidalLocking["sizeSource"] } | null => {
  const { observation } = planet;
  const radius =
    positive(observation.radiusEarth) ??
    (positive(observation.radiusJupiter) ?? 0) * EARTH_RADII_PER_JUPITER_RADIUS;
  const mass =
    positive(observation.massEarth) ??
    (positive(observation.massJupiter) ?? 0) * EARTH_MASSES_PER_JUPITER_MASS;
  const density = TIDAL_RESPONSE[planet.kind].densityGCm3 / EARTH_DENSITY_G_CM3;

  if (radius > 0 && mass > 0) return { massEarth: mass, radiusEarth: radius, source: "measured" };
  if (radius > 0)
    return { massEarth: density * radius ** 3, radiusEarth: radius, source: "derived" };
  if (mass > 0)
    return { massEarth: mass, radiusEarth: (mass / density) ** (1 / 3), source: "derived" };
  return null;
};

/**
 * Estimates how long star-raised tides take to despin a world (Gladman et al. 1996,
 * constant-Q form) and whether it is therefore synchronously rotating. Solar System bodies are
 * excluded because their rotation is measured.
 */
export const deriveTidalLocking = (planet: ExoplanetProfile): TidalLocking | null => {
  if (planet.solarSystem) return null;
  const { observation } = planet;
  const hostMassSolar = positive(observation.hostMassSolar);
  if (hostMassSolar === null) return null;

  const measuredPeriodDays = positive(observation.orbitalPeriodDays);
  const semiMajorAxisAu =
    positive(observation.semiMajorAxisAu) ??
    (measuredPeriodDays === null
      ? null
      : (hostMassSolar * (measuredPeriodDays / DAYS_PER_YEAR) ** 2) ** (1 / 3));
  if (semiMajorAxisAu === null) return null;

  const size = planetSize(planet);
  if (!size) return null;

  const response = TIDAL_RESPONSE[planet.kind];
  const massKg = size.massEarth * EARTH_MASS_KG;
  const radiusM = size.radiusEarth * EARTH_RADIUS_M;
  const starMassKg = hostMassSolar * SOLAR_MASS_KG;
  const momentOfInertia = response.momentOfInertiaFactor * massKg * radiusM ** 2;
  const seconds =
    (INITIAL_SPIN_RADIANS_PER_SECOND *
      (semiMajorAxisAu * AU_M) ** 6 *
      momentOfInertia *
      response.qualityFactor) /
    (3 * GRAVITATIONAL_CONSTANT * starMassKg ** 2 * response.loveNumber * radiusM ** 5);
  const despinTimescaleYears = seconds / SECONDS_PER_YEAR;
  if (!Number.isFinite(despinTimescaleYears)) return null;

  const locked = despinTimescaleYears < TIDAL_LOCK_THRESHOLD_YEARS;
  const orbitalPeriodDays =
    measuredPeriodDays ?? Math.sqrt(semiMajorAxisAu ** 3 / hostMassSolar) * DAYS_PER_YEAR;

  return {
    despinTimescaleYears,
    locked,
    rotationPeriodDays: locked ? orbitalPeriodDays : null,
    sizeSource: size.source,
  };
};
