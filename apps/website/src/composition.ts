import type { ExoplanetProfile } from "@exora/contracts";
import type { PanelFact } from "./destination-panel.ts";

/*
 * WHAT IT IS MADE OF
 *
 * A weighed mass and a measured radius together fix a density, and for a small rocky world a
 * density fixes how much of it can be iron. Zeng, Sasselov & Jacobsen (2016) fit rocky interiors
 * over 1–8 Earth masses as R = (1.07 − 0.21·CMF)·M^(1/3.7), so the core mass fraction follows by
 * inversion. Outside that range, or when either value is an estimate, the reading is withheld
 * rather than extrapolated. The Earth Similarity Index (Schulze-Makuch et al. 2011) is printed as
 * the comparison it is — four ratios to Earth, weighted — not as a verdict on habitability.
 */

const EARTH_RADII_PER_JUPITER_RADIUS = 11.209;
const EARTH_MASSES_PER_JUPITER_MASS = 317.83;
const EARTH_EQUILIBRIUM_KELVIN = 255;
const ZENG_EXPONENT = 1 / 3.7;
const ZENG_MASS_RANGE = [1, 8] as const;

/** Radius in Earth radii of a rocky planet with the given mass and iron core mass fraction. */
export const zengRockyRadius = (massEarth: number, coreMassFraction: number): number =>
  (1.07 - 0.21 * coreMassFraction) * massEarth ** ZENG_EXPONENT;

export interface CompositionReading {
  coreMassFraction: number | null;
  /** Null when the planet is too large for rock and iron: it needs volatiles or gas. */
  coreMassFractionVerdict: "denser-than-iron" | "iron-rock" | "needs-volatiles" | null;
  earthSimilarity: { global: number; interior: number; surface: number } | null;
  massEarth: number;
  massLowerBound: boolean;
  radiusEarth: number;
  radiusEstimated: boolean;
}

const positive = (value: number | null | undefined): number | null =>
  value !== null && value !== undefined && Number.isFinite(value) && value > 0 ? value : null;

export const planetMassRadius = (
  planet: ExoplanetProfile,
): { massEarth: number; radiusEarth: number } | null => {
  const { observation } = planet;
  const mass =
    positive(observation.massEarth) ??
    (positive(observation.massJupiter) ?? 0) * EARTH_MASSES_PER_JUPITER_MASS;
  const radius =
    positive(observation.radiusEarth) ??
    (positive(observation.radiusJupiter) ?? 0) * EARTH_RADII_PER_JUPITER_RADIUS;
  return mass > 0 && radius > 0 ? { massEarth: mass, radiusEarth: radius } : null;
};

// Schulze-Makuch et al. (2011) Table 1 weights.
const ESI_WEIGHTS = { density: 1.07, escape: 0.7, radius: 0.57, temperature: 5.58 } as const;

const similarity = (value: number, earth: number, weight: number, parameters: number): number =>
  (1 - Math.abs((value - earth) / (value + earth))) ** (weight / parameters);

export const earthSimilarityIndex = (
  massEarth: number,
  radiusEarth: number,
  equilibriumTemperatureKelvin: number,
): { global: number; interior: number; surface: number } => {
  const density = massEarth / radiusEarth ** 3;
  const escape = Math.sqrt(massEarth / radiusEarth);
  const interior =
    similarity(radiusEarth, 1, ESI_WEIGHTS.radius, 2) *
    similarity(density, 1, ESI_WEIGHTS.density, 2);
  const surface =
    similarity(escape, 1, ESI_WEIGHTS.escape, 2) *
    similarity(equilibriumTemperatureKelvin, EARTH_EQUILIBRIUM_KELVIN, ESI_WEIGHTS.temperature, 2);
  return { global: Math.sqrt(interior * surface), interior, surface };
};

export const readComposition = (
  planet: ExoplanetProfile,
  equilibriumTemperatureKelvin: number | null,
): CompositionReading | null => {
  const values = planetMassRadius(planet);
  if (values === null) return null;
  const { massProvenance, radiusProvenance } = planet.observation;
  const { massEarth, radiusEarth } = values;
  const weighed = massProvenance === "measured" && radiusProvenance !== "estimated";
  const inRange = massEarth >= ZENG_MASS_RANGE[0] && massEarth <= ZENG_MASS_RANGE[1];
  const coreMassFraction =
    weighed && inRange ? (1.07 - radiusEarth / massEarth ** ZENG_EXPONENT) / 0.21 : null;

  return {
    coreMassFraction: coreMassFraction === null ? null : Math.min(Math.max(coreMassFraction, 0), 1),
    coreMassFractionVerdict:
      coreMassFraction === null
        ? null
        : coreMassFraction > 1
          ? "denser-than-iron"
          : coreMassFraction < 0
            ? "needs-volatiles"
            : "iron-rock",
    earthSimilarity:
      weighed && equilibriumTemperatureKelvin !== null && planet.kind === "rocky"
        ? earthSimilarityIndex(massEarth, radiusEarth, equilibriumTemperatureKelvin)
        : null,
    massEarth,
    massLowerBound: massProvenance === "minimum",
    radiusEarth,
    radiusEstimated: radiusProvenance === "estimated",
  };
};

const percent = new Intl.NumberFormat("en", { maximumFractionDigits: 0, style: "percent" });
const twoDecimals = new Intl.NumberFormat("en", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

export const compositionFacts = (reading: CompositionReading | null): PanelFact[] => {
  if (reading === null) return [];
  const facts: PanelFact[] = [];
  switch (reading.coreMassFractionVerdict) {
    case "iron-rock":
      facts.push({
        detail: `Iron share of the mass if it is only rock and iron · Earth 32% · Zeng et al. 2016`,
        label: "Implied iron core",
        tone: "gold",
        value: percent.format(reading.coreMassFraction ?? 0),
      });
      break;
    case "needs-volatiles":
      facts.push({
        detail:
          "Too large for its mass to be rock and iron alone · it must hold water, ices or a gas envelope",
        label: "Implied iron core",
        tone: "gold",
        value: "None · volatile-rich",
      });
      break;
    case "denser-than-iron":
      facts.push({
        detail: "Smaller than even pure iron allows at this mass · at the edge of its error bars",
        label: "Implied iron core",
        tone: "gold",
        value: "Denser than iron",
      });
      break;
    case null:
      break;
  }
  if (reading.earthSimilarity) {
    const { global, interior, surface } = reading.earthSimilarity;
    facts.push({
      detail: `Interior ${twoDecimals.format(interior)} · surface ${twoDecimals.format(surface)} · weighted ratios of radius, density, escape velocity and equilibrium temperature to Earth's · a comparison, not a habitability verdict`,
      label: "Earth similarity",
      value: twoDecimals.format(global),
    });
  }
  return facts;
};
