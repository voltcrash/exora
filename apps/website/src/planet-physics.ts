import type { ExoplanetProfile } from "@exora/contracts";
import type { PlanetDerivedProperties } from "@exora/worldgen";

const EARTH_ESCAPE_VELOCITY_KM_S = 11.186;
const EARTH_DENSITY_G_CM3 = 5.51;
const EARTH_RADII_PER_JUPITER_RADIUS = 11.209;
const EARTH_MASSES_PER_JUPITER_MASS = 317.83;
const SOLAR_RADIUS_KM = 695_700;
const AU_KM = 149_597_870.7;

export interface PlanetPhysicsFact {
  detail: string;
  label: string;
  unit?: string;
  value: string;
}

const angularDiameterDegrees = (radiusSolar: number, orbitAu: number): number =>
  (2 * Math.atan((radiusSolar * SOLAR_RADIUS_KM) / (orbitAu * AU_KM)) * 180) / Math.PI;

const SUN_FROM_EARTH_DEGREES = angularDiameterDegrees(1, 1);

const twoFigures = new Intl.NumberFormat("en", { maximumSignificantDigits: 2 });
const threeFigures = new Intl.NumberFormat("en", { maximumSignificantDigits: 3 });

const measured = (value: number | null): number | null =>
  value !== null && Number.isFinite(value) && value > 0 ? value : null;

const densityReading = (density: number): string =>
  density < 2
    ? "Lighter than rock alone allows · thick volatile envelope"
    : density < 4
      ? "Rock diluted by water or gas"
      : density < 7
        ? "Comparable to Earth's rock and iron"
        : "Denser than Earth · iron-rich or compressed";

/**
 * The physics a reader can check by hand from the archive's own numbers. Nothing here is drawn
 * from an assumed default: a value missing from the record leaves its fact out.
 */
export const derivePlanetPhysics = (
  planet: ExoplanetProfile,
  derived: Pick<PlanetDerivedProperties, "bulkDensityGCm3" | "insolationEarthRelative">,
): PlanetPhysicsFact[] => {
  const { observation } = planet;
  const radius =
    measured(observation.radiusEarth) ??
    (measured(observation.radiusJupiter) ?? 0) * EARTH_RADII_PER_JUPITER_RADIUS;
  const mass =
    measured(observation.massEarth) ??
    (measured(observation.massJupiter) ?? 0) * EARTH_MASSES_PER_JUPITER_MASS;
  const giant = planet.kind === "gas-giant" || planet.kind === "ice-giant";
  const facts: PlanetPhysicsFact[] = [];

  if (mass > 0 && radius > 0) {
    facts.push(
      {
        detail: `M / R² from ${twoFigures.format(mass)} M⊕ and ${twoFigures.format(radius)} R⊕${giant ? " · at the 1-bar level" : ""}`,
        label: giant ? "Cloud-top gravity" : "Surface gravity",
        unit: "g",
        value: twoFigures.format(mass / radius ** 2),
      },
      {
        detail: `Earth ${threeFigures.format(EARTH_ESCAPE_VELOCITY_KM_S)} km/s · √(M / R)`,
        label: "Escape velocity",
        unit: "km/s",
        value: threeFigures.format(EARTH_ESCAPE_VELOCITY_KM_S * Math.sqrt(mass / radius)),
      },
    );
  }
  if (derived.bulkDensityGCm3 !== null) {
    facts.push({
      detail: `${densityReading(derived.bulkDensityGCm3)} · Earth ${EARTH_DENSITY_G_CM3}`,
      label: "Bulk density",
      unit: "g/cm³",
      value: twoFigures.format(derived.bulkDensityGCm3),
    });
  }
  if (derived.insolationEarthRelative !== null) {
    facts.push({
      detail: "Host luminosity / orbit² · Earth receives 1",
      label: "Stellar flux",
      value: `${threeFigures.format(derived.insolationEarthRelative)}× Earth`,
    });
  }
  const hostRadius = measured(observation.hostRadiusSolar);
  const orbit = measured(observation.semiMajorAxisAu);
  if (hostRadius !== null && orbit !== null) {
    const width = angularDiameterDegrees(hostRadius, orbit);
    facts.push({
      detail: `${threeFigures.format(width / SUN_FROM_EARTH_DEGREES)}× the Sun's width from Earth · 2R★ / a`,
      label: "Star in the sky",
      value: `${threeFigures.format(width)}°`,
    });
  }
  const period = measured(observation.orbitalPeriodDays);
  if (period !== null) {
    facts.push({
      detail:
        period < 1
          ? `${threeFigures.format(period * 24)} hours · measured orbital period`
          : period > 730
            ? `${threeFigures.format(period / 365.25)} Earth years · measured orbital period`
            : "Measured orbital period",
      label: "Year",
      unit: "days",
      value: threeFigures.format(period),
    });
  }
  return facts;
};
