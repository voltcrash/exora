import type { ExoplanetProfile } from "@exora/contracts";
import type { PanelFact } from "./destination-panel.ts";

const GRAVITATIONAL_CONSTANT = 6.674_30e-11;
const SOLAR_MASS_KG = 1.988_41e30;
const EARTH_MASS_KG = 5.972_17e24;
const SOLAR_RADIUS_M = 6.957e8;
const EARTH_RADIUS_M = 6.378_1e6;
const AU_M = 1.495_978_707e11;
const SECONDS_PER_DAY = 86_400;
const BOLTZMANN = 1.380_649e-23;
const ATOMIC_MASS_KG = 1.660_539_07e-27;
const EARTH_RADII_PER_JUPITER_RADIUS = 11.209;
const EARTH_MASSES_PER_JUPITER_MASS = 317.83;

export type SignalSource = "derived" | "measured";

export interface TransitSignal {
  /** Fractional dip at mid-transit, 0.005 for half a percent. */
  depth: number;
  depthSource: SignalSource;
  durationHours: number | null;
  durationSource: SignalSource | null;
  /** Null when neither the archive nor the inclination fixes where the chord crosses. */
  impactParameter: number | null;
  impactSource: SignalSource | null;
  periodDays: number | null;
  radiusRatio: number;
  radiusRatioSource: SignalSource;
}

export interface VelocitySignal {
  /** The star's reflex speed along our line of sight, peak to mean. */
  amplitudeMetersPerSecond: number;
  /** True when only the minimum mass was known, so the real wobble may be larger. */
  lowerBound: boolean;
  source: SignalSource;
}

export interface AtmosphereSignal {
  meanMolecularWeight: number;
  /** Extra dip one scale height of atmosphere adds to the transit, as a fraction of starlight. */
  perScaleHeight: number;
  scaleHeightKilometers: number;
}

export interface DetectionSignalReading {
  /** Angular size of the star's reflex orbit as seen from Earth, in microarcseconds. */
  astrometricMicroarcseconds: number | null;
  atmosphere: AtmosphereSignal | null;
  /** Radius of the circle the star itself swings around the shared centre of mass. */
  reflexOrbitKilometers: number | null;
  reflexOrbitLowerBound: boolean;
  hostRadiusKilometers: number | null;
  /** The chance a randomly oriented copy of this orbit would carry the planet across its star. */
  transitProbability: number | null;
  transit: TransitSignal | null;
  velocity: VelocitySignal | null;
}

const positive = (value: number | null | undefined): number | null =>
  value !== null && value !== undefined && Number.isFinite(value) && value > 0 ? value : null;

const planetRadiusEarth = ({ observation }: ExoplanetProfile): number | null => {
  const radius =
    positive(observation.radiusEarth) ??
    (positive(observation.radiusJupiter) ?? 0) * EARTH_RADII_PER_JUPITER_RADIUS;
  return radius > 0 ? radius : null;
};

const planetMassEarth = ({ observation }: ExoplanetProfile): number | null => {
  const mass =
    positive(observation.massEarth) ??
    (positive(observation.massJupiter) ?? 0) * EARTH_MASSES_PER_JUPITER_MASS;
  return mass > 0 ? mass : null;
};

/** Whether the archive holds evidence the world was seen crossing its star. */
export const hasTransited = (planet: ExoplanetProfile): boolean => {
  const signal = planet.observation.signal;
  return (
    planet.observation.discoveryMethod === "Transit" ||
    positive(signal?.transitDepthPercent) !== null ||
    positive(signal?.transitDurationHours) !== null ||
    positive(signal?.radiusRatio) !== null
  );
};

const transitSignal = (planet: ExoplanetProfile): TransitSignal | null => {
  if (!hasTransited(planet)) return null;
  const { observation } = planet;
  const signal = observation.signal;
  const hostRadius = positive(observation.hostRadiusSolar);
  const radius = planetRadiusEarth(planet);
  const measuredRatio = positive(signal?.radiusRatio);
  const radiusRatio =
    measuredRatio ??
    (hostRadius !== null && radius !== null && observation.radiusProvenance !== "estimated"
      ? (radius * EARTH_RADIUS_M) / (hostRadius * SOLAR_RADIUS_M)
      : null);
  const measuredDepth = positive(signal?.transitDepthPercent);
  if (radiusRatio === null && measuredDepth === null) return null;
  const ratio = radiusRatio ?? Math.sqrt(measuredDepth! / 100);

  const orbit = positive(observation.semiMajorAxisAu);
  const inclination = observation.orbitalInclinationDegrees;
  const scaledOrbit =
    orbit !== null && hostRadius !== null ? (orbit * AU_M) / (hostRadius * SOLAR_RADIUS_M) : null;
  const measuredImpact = signal?.impactParameter ?? null;
  const derivedImpact =
    scaledOrbit !== null && inclination !== null && Number.isFinite(inclination)
      ? scaledOrbit * Math.abs(Math.cos((inclination * Math.PI) / 180))
      : null;
  const impactParameter =
    measuredImpact !== null && Number.isFinite(measuredImpact) && measuredImpact >= 0
      ? measuredImpact
      : derivedImpact;

  const period = positive(observation.orbitalPeriodDays);
  const measuredDuration = positive(signal?.transitDurationHours);
  let derivedDuration: number | null = null;
  if (measuredDuration === null && period !== null && scaledOrbit !== null) {
    // Seager & Mallén-Ornelas (2003), circular orbit; a central chord when b is unknown.
    const b = impactParameter ?? 0;
    const chord = (1 + ratio) ** 2 - b ** 2;
    const sinI = Math.sqrt(Math.max(1 - (b / scaledOrbit) ** 2, 0));
    const argument = chord > 0 && sinI > 0 ? Math.sqrt(chord) / scaledOrbit / sinI : null;
    if (argument !== null) {
      derivedDuration = ((period * 24) / Math.PI) * Math.asin(Math.min(argument, 1));
    }
  }

  return {
    depth: measuredDepth !== null ? measuredDepth / 100 : ratio ** 2,
    depthSource: measuredDepth !== null ? "measured" : "derived",
    durationHours: measuredDuration ?? derivedDuration,
    durationSource:
      measuredDuration !== null ? "measured" : derivedDuration !== null ? "derived" : null,
    impactParameter,
    impactSource:
      measuredImpact !== null && impactParameter === measuredImpact
        ? "measured"
        : impactParameter !== null
          ? "derived"
          : null,
    periodDays: period,
    radiusRatio: ratio,
    radiusRatioSource: measuredRatio !== null ? "measured" : "derived",
  };
};

// Mass times sin i: what a velocity curve weighs. Null when the tilt is unknown for a true mass.
const projectedMass = (planet: ExoplanetProfile): { lowerBound: boolean; mass: number } | null => {
  const mass = planetMassEarth(planet);
  if (mass === null) return null;
  const { massProvenance, orbitalInclinationDegrees } = planet.observation;
  if (massProvenance === "minimum") return { lowerBound: true, mass };
  if (massProvenance !== "measured") return null;
  if (orbitalInclinationDegrees === null || !Number.isFinite(orbitalInclinationDegrees)) {
    return null;
  }
  return {
    lowerBound: false,
    mass: mass * Math.abs(Math.sin((orbitalInclinationDegrees * Math.PI) / 180)),
  };
};

const velocitySignal = (planet: ExoplanetProfile): VelocitySignal | null => {
  const { observation } = planet;
  const measured = positive(observation.signal?.radialVelocityAmplitudeMetersPerSecond);
  if (measured !== null) {
    return { amplitudeMetersPerSecond: measured, lowerBound: false, source: "measured" };
  }
  const projected = projectedMass(planet);
  const period = positive(observation.orbitalPeriodDays);
  const hostMass = positive(observation.hostMassSolar);
  if (projected === null || period === null || hostMass === null) return null;
  const eccentricity = observation.orbitalEccentricity ?? 0;
  if (!(eccentricity >= 0 && eccentricity < 1)) return null;
  const planetMass = projected.mass * EARTH_MASS_KG;
  const totalMass = hostMass * SOLAR_MASS_KG + planetMass;
  const amplitude =
    Math.cbrt((2 * Math.PI * GRAVITATIONAL_CONSTANT) / (period * SECONDS_PER_DAY)) *
    (planetMass / totalMass ** (2 / 3)) *
    (1 / Math.sqrt(1 - eccentricity ** 2));
  return {
    amplitudeMetersPerSecond: amplitude,
    lowerBound: projected.lowerBound,
    source: "derived",
  };
};

const atmosphereSignal = (
  planet: ExoplanetProfile,
  transit: TransitSignal | null,
  equilibriumTemperatureKelvin: number | null,
): AtmosphereSignal | null => {
  const { observation } = planet;
  if (transit === null || equilibriumTemperatureKelvin === null) return null;
  if (observation.massProvenance !== "measured" || observation.radiusProvenance === "estimated") {
    return null;
  }
  const mass = planetMassEarth(planet);
  const radius = planetRadiusEarth(planet);
  const hostRadius = positive(observation.hostRadiusSolar);
  if (mass === null || radius === null || hostRadius === null) return null;
  // Hydrogen and helium for a giant; Earth's air for a rocky world. Either is an assumption.
  const meanMolecularWeight = planet.kind === "rocky" ? 28.97 : 2.3;
  const radiusMeters = radius * EARTH_RADIUS_M;
  const gravity = (GRAVITATIONAL_CONSTANT * mass * EARTH_MASS_KG) / radiusMeters ** 2;
  const scaleHeight =
    (BOLTZMANN * equilibriumTemperatureKelvin) / (meanMolecularWeight * ATOMIC_MASS_KG * gravity);
  const starRadius = hostRadius * SOLAR_RADIUS_M;
  return {
    meanMolecularWeight,
    perScaleHeight: (2 * scaleHeight * radiusMeters) / starRadius ** 2,
    scaleHeightKilometers: scaleHeight / 1_000,
  };
};

/**
 * What a telescope would have to see to know this world is there: the dip it cuts into its star,
 * the wobble it raises in the star's velocity and position, and the odds it transits at all.
 * Archive measurements are preferred verbatim; every derived value says so.
 */
export const readDetectionSignal = (
  planet: ExoplanetProfile,
  equilibriumTemperatureKelvin: number | null,
): DetectionSignalReading => {
  const { observation } = planet;
  const hostRadius = positive(observation.hostRadiusSolar);
  const hostMass = positive(observation.hostMassSolar);
  const orbit = positive(observation.semiMajorAxisAu);
  const distance = positive(observation.distanceParsecs);
  const radius = planetRadiusEarth(planet);
  const mass = planetMassEarth(planet);
  const massKnown =
    mass !== null &&
    (observation.massProvenance === "measured" || observation.massProvenance === "minimum");
  const transit = transitSignal(planet);
  const massRatio =
    massKnown && hostMass !== null
      ? (mass * EARTH_MASS_KG) / (hostMass * SOLAR_MASS_KG + mass * EARTH_MASS_KG)
      : null;

  return {
    astrometricMicroarcseconds:
      massRatio !== null && orbit !== null && distance !== null
        ? ((massRatio * orbit) / distance) * 1e6
        : null,
    atmosphere: atmosphereSignal(planet, transit, equilibriumTemperatureKelvin),
    hostRadiusKilometers: hostRadius === null ? null : (hostRadius * SOLAR_RADIUS_M) / 1_000,
    reflexOrbitKilometers:
      massRatio !== null && orbit !== null ? (massRatio * orbit * AU_M) / 1_000 : null,
    reflexOrbitLowerBound: observation.massProvenance === "minimum",
    transit,
    transitProbability:
      hostRadius !== null && orbit !== null
        ? Math.min(
            (hostRadius * SOLAR_RADIUS_M + (radius ?? 0) * EARTH_RADIUS_M) / (orbit * AU_M),
            1,
          )
        : null,
    velocity: velocitySignal(planet),
  };
};

const twoFigures = new Intl.NumberFormat("en", { maximumSignificantDigits: 2 });
const threeFigures = new Intl.NumberFormat("en", { maximumSignificantDigits: 3 });
const wholeNumber = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

// Earth crossing the Sun, and the Sun's reflex to Jupiter seen from 10 pc, as fixed yardsticks.
const EARTH_TRANSIT_PPM = 84;
const EARTH_ON_SUN_METERS_PER_SECOND = 0.09;
const JUPITER_ON_SUN_METERS_PER_SECOND = 12.5;
const WALKING_METERS_PER_SECOND = 1.4;

const sourceNote = (source: SignalSource | null, derivation: string): string =>
  source === "measured" ? "Measured by the archive" : derivation;

const formatDuration = (hours: number): string =>
  hours < 1 ? `${wholeNumber.format(hours * 60)} min` : `${threeFigures.format(hours)} h`;

const chordReading = (impact: number, radiusRatio: number): string =>
  impact > 1 - radiusRatio
    ? "a grazing chord that clips the limb"
    : impact < 0.3
      ? "crossing close to the star's centre"
      : impact < 0.7
        ? "crossing between the centre and the limb"
        : "crossing near the limb";

const walkingComparison = (speed: number): string =>
  speed >= WALKING_METERS_PER_SECOND * 2
    ? `${twoFigures.format(speed / WALKING_METERS_PER_SECOND)}× walking pace`
    : speed >= WALKING_METERS_PER_SECOND / 2
      ? "about walking pace"
      : `${wholeNumber.format(speed * 100)} cm/s`;

/** The detection reading as panel facts, each naming whether it was measured or derived. */
export const detectionFacts = (
  planet: ExoplanetProfile,
  reading: DetectionSignalReading,
): PanelFact[] => {
  const { observation } = planet;
  const facts: PanelFact[] = [
    {
      detail:
        observation.discoveryYear === null
          ? "Discovery year not reported"
          : `Announced in ${String(observation.discoveryYear)}`,
      label: "Found by",
      tone: "cyan",
      value: observation.discoveryMethod,
    },
  ];
  const { transit, velocity } = reading;

  if (transit) {
    const ppm = transit.depth * 1e6;
    facts.push({
      detail: `${wholeNumber.format(ppm)} ppm · ${sourceNote(transit.depthSource, "(Rp / R★)² from the measured radii")} · Earth crossing the Sun: ${String(EARTH_TRANSIT_PPM)} ppm`,
      label: "Transit depth",
      unit: "%",
      value: threeFigures.format(transit.depth * 100),
    });
    if (transit.durationHours !== null) {
      facts.push({
        detail: sourceNote(
          transit.durationSource,
          transit.impactParameter === null
            ? "At most · a central chord, since the tilt is not reported"
            : "From the period, orbit, radii and chord · circular orbit",
        ),
        label: "Transit duration",
        value: formatDuration(transit.durationHours),
      });
    }
    if (transit.impactParameter !== null) {
      facts.push({
        detail: `${chordReading(transit.impactParameter, transit.radiusRatio)} · ${sourceNote(transit.impactSource, "a cos i / R★ from the measured tilt")}`,
        label: "Impact parameter",
        value: threeFigures.format(transit.impactParameter),
      });
    }
  }

  if (reading.transitProbability !== null) {
    facts.push({
      detail: `R★ / a · the chance a randomly tilted copy of this orbit would cross its star${transit ? "" : " · this one is not seen to"}`,
      label: "Transit odds",
      value: `1 in ${wholeNumber.format(Math.max(1, Math.round(1 / reading.transitProbability)))}`,
    });
  }

  if (velocity) {
    const speed = velocity.amplitudeMetersPerSecond;
    facts.push({
      detail: `${walkingComparison(speed)} · ${sourceNote(velocity.source, velocity.lowerBound ? "At least · K from the minimum mass and period" : "K from the mass, tilt, period and host mass")} · Jupiter moves the Sun ${String(JUPITER_ON_SUN_METERS_PER_SECOND)} m/s, Earth ${String(EARTH_ON_SUN_METERS_PER_SECOND)}`,
      label: "Star's wobble",
      unit: "m/s",
      value: `${velocity.lowerBound ? "≥" : ""}${threeFigures.format(speed)}`,
    });
  }

  if (reading.reflexOrbitKilometers !== null) {
    const inside =
      reading.hostRadiusKilometers !== null &&
      reading.reflexOrbitKilometers < reading.hostRadiusKilometers;
    facts.push({
      detail: `a · Mp / (M★ + Mp) · the star circles a point ${inside ? "inside its own surface" : "beyond its own surface"}`,
      label: "Star's reflex orbit",
      unit: "km",
      value: `${reading.reflexOrbitLowerBound ? "≥" : ""}${threeFigures.format(reading.reflexOrbitKilometers)}`,
    });
  }

  if (reading.astrometricMicroarcseconds !== null) {
    facts.push({
      detail: `How far the star shifts on the sky from Earth · Jupiter shifts the Sun 500 µas from 10 pc`,
      label: "Astrometric wobble",
      unit: "µas",
      value: `${reading.reflexOrbitLowerBound ? "≥" : ""}${threeFigures.format(reading.astrometricMicroarcseconds)}`,
    });
  }

  if (reading.atmosphere) {
    const { meanMolecularWeight, perScaleHeight, scaleHeightKilometers } = reading.atmosphere;
    facts.push({
      detail: `2HRp / R★² · a ${threeFigures.format(scaleHeightKilometers)} km scale height if the air is ${meanMolecularWeight < 5 ? "hydrogen and helium" : "Earth-like"} (μ ${String(meanMolecularWeight)}) · an assumption`,
      label: "Atmosphere signal",
      unit: "ppm",
      value: threeFigures.format(perScaleHeight * 1e6),
    });
  }

  return facts;
};
