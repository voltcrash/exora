import type { ExoplanetProfile } from "@exora/contracts";
import { hashObjectId } from "@exora/worldgen";

export const EARTH_RADIUS_AU = 4.26351e-5;
export const SOLAR_RADIUS_AU = 4.65047e-3;
const EARTH_RADII_PER_SOLAR_RADIUS = SOLAR_RADIUS_AU / EARTH_RADIUS_AU;
const EARTH_RADII_PER_JUPITER_RADIUS = 11.209;
const DAYS_PER_YEAR = 365.25;

export const DIORAMA_INNER_SCENE_UNITS = 3;
export const DIORAMA_OUTER_SCENE_UNITS = 13;
export const DIORAMA_FLOOR_SCENE_UNITS = 1.4;
const FLOOR_CLEARANCE = 1.3;
export const MIN_MAPPED_DECADES = 0.6;

export const BODY_RADIUS_EXPONENT = 0.4;
export const EARTH_BODY_RADIUS_SCENE_UNITS = 0.14;

export const INNERMOST_ORBIT_SECONDS = 9;

const MAX_DRAWN_ECCENTRICITY = 0.95;

export type ElementSource = "assumed" | "derived" | "measured";

export interface DistanceMapping {
  centreLog10Au: number;
  decades: number;
  floorSceneUnits: number;
  innerSceneUnits: number;
  maxAu: number;
  minAu: number;
  outerSceneUnits: number;
  widened: boolean;
}

export interface OrbitElements {
  eccentricity: number;
  eccentricitySource: Extract<ElementSource, "assumed" | "measured">;
  inclinationDegrees: number;
  inclinationSource: Extract<ElementSource, "assumed" | "measured">;
  periodDays: number | null;
  periodSource: Extract<ElementSource, "derived" | "measured"> | null;
  semiMajorAxisAu: number;
  semiMajorAxisSource: Extract<ElementSource, "derived" | "measured">;
}

export interface PlacedOrbit {
  bodyRadiusSceneUnits: number;
  elements: OrbitElements;
  phaseRadians: number;
  planet: ExoplanetProfile;
  radiusEarth: number;
  radiusEarthSource: Extract<ElementSource, "assumed" | "measured">;
  semiMajorAxisSceneUnits: number;
  tiltRadians: number;
}

export interface SystemLayout {
  bodyExaggeration: number;
  daysPerSecond: number;
  hostRadiusSceneUnits: number;
  hostRadiusSolar: number;
  hostRadiusSource: ElementSource;
  mapping: DistanceMapping;
  orbits: readonly PlacedOrbit[];
  unplaced: readonly ExoplanetProfile[];
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const positive = (value: number | null): number | null =>
  value !== null && Number.isFinite(value) && value > 0 ? value : null;

export const semiMajorAxisFromPeriod = (periodDays: number, hostMassSolar: number): number =>
  (hostMassSolar * (periodDays / DAYS_PER_YEAR) ** 2) ** (1 / 3);

export const periodFromSemiMajorAxis = (semiMajorAxisAu: number, hostMassSolar: number): number =>
  Math.sqrt(semiMajorAxisAu ** 3 / hostMassSolar) * DAYS_PER_YEAR;

export const deriveDistanceMapping = (
  semiMajorAxesAu: readonly number[],
  floorSceneUnits: number = DIORAMA_FLOOR_SCENE_UNITS,
): DistanceMapping => {
  // Fit each system logarithmically; absolute scaling would make extremes unusable.
  const axes = semiMajorAxesAu.filter((axis) => Number.isFinite(axis) && axis > 0);
  const minAu = axes.length > 0 ? Math.min(...axes) : 1;
  const maxAu = axes.length > 0 ? Math.max(...axes) : 1;
  const measuredDecades = Math.log10(maxAu) - Math.log10(minAu);

  return {
    centreLog10Au: (Math.log10(maxAu) + Math.log10(minAu)) / 2,
    decades: Math.max(measuredDecades, MIN_MAPPED_DECADES),
    floorSceneUnits,
    innerSceneUnits: DIORAMA_INNER_SCENE_UNITS,
    maxAu,
    minAu,
    outerSceneUnits: DIORAMA_OUTER_SCENE_UNITS,
    widened: measuredDecades < MIN_MAPPED_DECADES,
  };
};

export const mapDistance = (mapping: DistanceMapping, distanceAu: number): number => {
  if (!Number.isFinite(distanceAu) || distanceAu <= 0) return mapping.floorSceneUnits;
  const fraction = 0.5 + (Math.log10(distanceAu) - mapping.centreLog10Au) / mapping.decades;
  const span = mapping.outerSceneUnits - mapping.innerSceneUnits;
  return Math.max(mapping.floorSceneUnits, mapping.innerSceneUnits + span * fraction);
};

export const bodyRadiusSceneUnits = (radiusEarth: number): number =>
  clamp(
    EARTH_BODY_RADIUS_SCENE_UNITS * Math.max(radiusEarth, 1e-3) ** BODY_RADIUS_EXPONENT,
    0.045,
    1.5,
  );

export const bodyExaggeration = (mapping: DistanceMapping): number => {
  const sceneUnitsPerAu = mapDistance(mapping, mapping.maxAu) / mapping.maxAu;
  return EARTH_BODY_RADIUS_SCENE_UNITS / (EARTH_RADIUS_AU * sceneUnitsPerAu);
};

export const deriveOrbitElements = (planet: ExoplanetProfile): OrbitElements | null => {
  const observation = planet.observation;
  const measuredAxis = positive(observation.semiMajorAxisAu);
  const measuredPeriod = positive(observation.orbitalPeriodDays);
  const hostMassSolar = positive(observation.hostMassSolar);

  const semiMajorAxisAu =
    measuredAxis ??
    (measuredPeriod !== null && hostMassSolar !== null
      ? semiMajorAxisFromPeriod(measuredPeriod, hostMassSolar)
      : null);
  if (semiMajorAxisAu === null || !Number.isFinite(semiMajorAxisAu)) return null;

  const derivedPeriod =
    measuredPeriod === null && hostMassSolar !== null
      ? periodFromSemiMajorAxis(semiMajorAxisAu, hostMassSolar)
      : null;

  const measuredEccentricity = observation.orbitalEccentricity;
  const hasEccentricity =
    measuredEccentricity !== null &&
    Number.isFinite(measuredEccentricity) &&
    measuredEccentricity >= 0;

  const measuredInclination =
    // Solar-system inclinations use the orbital plane; transit data uses the sky plane.
    planet.solarSystem?.orbitalInclinationDegrees === null || !planet.solarSystem
      ? observation.orbitalInclinationDegrees
      : 90 - planet.solarSystem.orbitalInclinationDegrees;
  const hasInclination = measuredInclination !== null && Number.isFinite(measuredInclination);

  return {
    eccentricity: hasEccentricity ? Math.min(measuredEccentricity, MAX_DRAWN_ECCENTRICITY) : 0,
    eccentricitySource: hasEccentricity ? "measured" : "assumed",
    inclinationDegrees: hasInclination ? clamp(measuredInclination, 0, 180) : 90,
    inclinationSource: hasInclination ? "measured" : "assumed",
    periodDays: measuredPeriod ?? derivedPeriod,
    periodSource: measuredPeriod !== null ? "measured" : derivedPeriod !== null ? "derived" : null,
    semiMajorAxisAu,
    semiMajorAxisSource: measuredAxis !== null ? "measured" : "derived",
  };
};

export const orbitTiltRadians = (inclinationDegrees: number): number => {
  const folded = inclinationDegrees > 90 ? 180 - inclinationDegrees : inclinationDegrees;
  return ((90 - folded) * Math.PI) / 180;
};

const radiusEarthOf = (
  planet: ExoplanetProfile,
): { source: Extract<ElementSource, "assumed" | "measured">; value: number } => {
  const earth = positive(planet.observation.radiusEarth);
  if (earth !== null) return { source: "measured", value: earth };
  const jupiter = positive(planet.observation.radiusJupiter);
  if (jupiter !== null) {
    return { source: "measured", value: jupiter * EARTH_RADII_PER_JUPITER_RADIUS };
  }
  return { source: "assumed", value: 1 };
};

export const eccentricAnomaly = (meanAnomaly: number, eccentricity: number): number => {
  let anomaly = eccentricity < 0.8 ? meanAnomaly : Math.PI;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const derivative = 1 - eccentricity * Math.cos(anomaly);
    if (Math.abs(derivative) < 1e-8) break;
    const step = (anomaly - eccentricity * Math.sin(anomaly) - meanAnomaly) / derivative;
    anomaly -= step;
    if (Math.abs(step) < 1e-10) break;
  }
  return anomaly;
};

export const trueAnomalyFromEccentric = (
  eccentricAnomalyRadians: number,
  eccentricity: number,
): number =>
  2 *
  Math.atan2(
    Math.sqrt(1 + eccentricity) * Math.sin(eccentricAnomalyRadians / 2),
    Math.sqrt(1 - eccentricity) * Math.cos(eccentricAnomalyRadians / 2),
  );

export const orbitRadiusAu = (
  semiMajorAxisAu: number,
  eccentricity: number,
  trueAnomaly: number,
): number =>
  (semiMajorAxisAu * (1 - eccentricity ** 2)) / (1 + eccentricity * Math.cos(trueAnomaly));

export const orbitStateAt = (
  orbit: PlacedOrbit,
  elapsedSeconds: number,
  daysPerSecond: number,
): { radiusAu: number; trueAnomaly: number } => {
  const { eccentricity, periodDays, semiMajorAxisAu } = orbit.elements;
  const sweptRadians =
    periodDays === null || periodDays <= 0
      ? 0
      : ((elapsedSeconds * daysPerSecond) / periodDays) * Math.PI * 2;
  const meanAnomaly = orbit.phaseRadians + sweptRadians;
  const trueAnomaly = trueAnomalyFromEccentric(
    eccentricAnomaly(meanAnomaly, eccentricity),
    eccentricity,
  );

  return { radiusAu: orbitRadiusAu(semiMajorAxisAu, eccentricity, trueAnomaly), trueAnomaly };
};

const hostRadiusSolarOf = (
  planets: readonly ExoplanetProfile[],
): { source: ElementSource; value: number } => {
  for (const planet of planets) {
    const radius = positive(planet.observation.hostRadiusSolar);
    if (radius !== null) return { source: "measured", value: radius };
  }
  for (const planet of planets) {
    const mass = positive(planet.observation.hostMassSolar);
    if (mass !== null) return { source: "derived", value: mass ** 0.8 };
  }
  return { source: "assumed", value: 1 };
};

export const deriveSystemLayout = (planets: readonly ExoplanetProfile[]): SystemLayout => {
  const placed: { elements: OrbitElements; planet: ExoplanetProfile }[] = [];
  const unplaced: ExoplanetProfile[] = [];

  for (const planet of planets) {
    const elements = deriveOrbitElements(planet);
    if (elements) placed.push({ elements, planet });
    else unplaced.push(planet);
  }

  placed.sort((left, right) => left.elements.semiMajorAxisAu - right.elements.semiMajorAxisAu);

  const host = hostRadiusSolarOf(planets);
  const hostRadiusSceneUnits = bodyRadiusSceneUnits(host.value * EARTH_RADII_PER_SOLAR_RADIUS);
  const mapping = deriveDistanceMapping(
    placed.map(({ elements }) => elements.semiMajorAxisAu),
    Math.max(DIORAMA_FLOOR_SCENE_UNITS, hostRadiusSceneUnits * FLOOR_CLEARANCE),
  );

  const periods = placed
    .map(({ elements }) => elements.periodDays)
    .filter((period): period is number => period !== null && period > 0);
  const daysPerSecond = periods.length > 0 ? Math.min(...periods) / INNERMOST_ORBIT_SECONDS : 1;

  const orbits: PlacedOrbit[] = placed.map(({ elements, planet }) => {
    const radius = radiusEarthOf(planet);
    return {
      bodyRadiusSceneUnits: bodyRadiusSceneUnits(radius.value),
      elements,
      phaseRadians: ((hashObjectId(planet.id) % 3_600) / 3_600) * Math.PI * 2,
      planet,
      radiusEarth: radius.value,
      radiusEarthSource: radius.source,
      semiMajorAxisSceneUnits: mapDistance(mapping, elements.semiMajorAxisAu),
      tiltRadians: orbitTiltRadians(elements.inclinationDegrees),
    };
  });

  return {
    bodyExaggeration: bodyExaggeration(mapping),
    daysPerSecond,
    hostRadiusSceneUnits,
    hostRadiusSolar: host.value,
    hostRadiusSource: host.source,
    mapping,
    orbits,
    unplaced,
  };
};

const formatAu = (value: number): string =>
  value >= 10 ? value.toFixed(1) : value >= 1 ? value.toFixed(2) : value.toFixed(3);

const formatCount = (value: number): string =>
  value >= 1_000
    ? `${Math.round(value / 1_000).toLocaleString("en")}k`
    : Math.round(value).toLocaleString("en");

const formatDays = (value: number): string =>
  value >= 10 ? value.toFixed(0) : value >= 1 ? value.toFixed(1) : value.toFixed(3);

export const orbitMappingLabel = ({ mapping }: SystemLayout): string =>
  `LOG · ${formatAu(mapping.minAu)}–${formatAu(mapping.maxAu)} AU → ${mapDistance(
    mapping,
    mapping.minAu,
  ).toFixed(1)}–${mapDistance(mapping, mapping.maxAu).toFixed(1)} m`;

export const bodyScaleLabel = (layout: SystemLayout): string =>
  `r^${BODY_RADIUS_EXPONENT} · EARTH ×${formatCount(layout.bodyExaggeration)}`;

export const timeScaleLabel = (layout: SystemLayout): string =>
  `1 s = ${formatDays(layout.daysPerSecond)} d`;

export const elementProvenance = (elements: OrbitElements): string => {
  const assumptions: string[] = [];
  if (elements.semiMajorAxisSource === "derived") assumptions.push("ORBIT SIZE FROM PERIOD");
  if (elements.eccentricitySource === "assumed") assumptions.push("SHAPE ASSUMED CIRCULAR");
  if (elements.inclinationSource === "assumed") assumptions.push("PLANE ASSUMED SHARED");
  if (elements.periodSource === "derived") assumptions.push("PERIOD FROM ORBIT SIZE");
  if (elements.periodSource === null) assumptions.push("UNTIMED · PARKED");
  return assumptions.length === 0 ? "ORBIT FULLY MEASURED" : assumptions.join(" · ");
};

export const orbitSummary = (orbit: PlacedOrbit): string =>
  [
    `${formatAu(orbit.elements.semiMajorAxisAu)} AU`,
    orbit.elements.periodDays === null
      ? "period unknown"
      : `${formatDays(orbit.elements.periodDays)} d`,
    orbit.elements.eccentricitySource === "measured"
      ? `e ${orbit.elements.eccentricity.toFixed(2)}`
      : "e assumed 0",
  ].join(" · ");
