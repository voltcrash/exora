/**
 * Where a host system's worlds go in the diorama, and how much of that placement is a fact.
 *
 * A real planetary system does not fit in a room. Semi-major axes inside one host span two or
 * three orders of magnitude — TRAPPIST-1 packs seven worlds inside 0.07 AU, HR 8799 spreads four
 * across seventy — and the bodies on those orbits are four to five orders of magnitude smaller
 * again than the orbits themselves. Drawn linearly and to one scale, every system is either a
 * bare star with nothing visible around it or a single ring with six planets buried in the
 * photosphere. So both scales are compressed, and the compression is stated rather than hidden:
 * this module owns it, and the interface prints what it did.
 *
 * The tiers the rest of Exora keeps apart hold here too.
 *
 * - MEASURED: semi-major axis, eccentricity, inclination and period, as the archive reports them.
 *   Any of them can be missing, and a missing one is never quietly replaced with a tidy value.
 * - DERIVED: the mapping from those measurements onto scene units, and anything Kepler's third
 *   law can supply from two measured quantities (an axis from a period, a period from an axis).
 * - INFERRED: where along its orbit a planet happens to be. Nothing in the catalog says, so the
 *   starting angle is seeded from the planet's own id and is a drawing choice, not a claim.
 *
 * Kept free of Babylon so every number here can be checked without a GPU.
 */

import type { ExoplanetProfile } from "@exora/contracts";
import { hashObjectId } from "@exora/worldgen";

/** Earth's equatorial radius as a fraction of an astronomical unit. */
export const EARTH_RADIUS_AU = 4.26351e-5;
/** The Sun's radius as a fraction of an astronomical unit, matching worldgen's own constant. */
export const SOLAR_RADIUS_AU = 4.65047e-3;
const EARTH_RADII_PER_SOLAR_RADIUS = SOLAR_RADIUS_AU / EARTH_RADIUS_AU;
const EARTH_RADII_PER_JUPITER_RADIUS = 11.209;
const DAYS_PER_YEAR = 365.25;

/** Scene radius the innermost mapped orbit sits at. Scene units are metres inside a session. */
export const DIORAMA_INNER_SCENE_UNITS = 3;
/** Scene radius the outermost mapped orbit sits at. */
export const DIORAMA_OUTER_SCENE_UNITS = 13;
/**
 * How close to the centre an instantaneous radius may be drawn.
 *
 * Orbit radii are mapped logarithmically, and a logarithm has no floor: the perihelion of a very
 * eccentric orbit maps arbitrarily far below the band and would pass through — or behind — the
 * star. Held here instead, which reads as an orbit grazing the star, which is what it does.
 *
 * A floor rather than the floor: `deriveSystemLayout` raises it clear of the host star's own
 * drawn disc, since a giant host is drawn large enough to swallow this one.
 */
export const DIORAMA_FLOOR_SCENE_UNITS = 1.4;
/** How far outside the host star's drawn radius the floor is held. */
const FLOOR_CLEARANCE = 1.3;
/**
 * The narrowest span of semi-major axes the radial band will stretch to fill.
 *
 * Normalising each system onto the same band is what makes a compact system explorable at all,
 * but stretched without a limit it would also claim that six worlds inside a hundredth of an AU
 * are spread across the room. Below this many decades the system is drawn centred and smaller
 * than the band, which is what "these orbits are all nearly the same size" should look like.
 */
export const MIN_MAPPED_DECADES = 0.6;

/**
 * How the drawn radius of a body relates to its measured one.
 *
 * An exponent below one, so that the ten-thousand-fold range from a sub-Earth to a host star
 * compresses into something a single view can hold while keeping the ordering and the sense of
 * "much bigger" intact. Bodies therefore do not share one exaggeration factor: small ones are
 * blown up harder than large ones, and `bodyExaggeration` below reports the factor at Earth's
 * radius so the interface can state a number rather than gesture at a curve.
 */
export const BODY_RADIUS_EXPONENT = 0.4;
/** Scene radius of an Earth-radius world, the anchor the exponent above works from. */
export const EARTH_BODY_RADIUS_SCENE_UNITS = 0.14;

/** How long the innermost orbit in a system takes to come round once, in wall-clock seconds. */
export const INNERMOST_ORBIT_SECONDS = 9;

/**
 * The hardest ellipse the renderer will draw.
 *
 * Above this the perihelion passage is so brief that the body spends a whole visit parked at
 * aphelion, and the curve degenerates into a line through the star. Catalogue eccentricities
 * this high are rare and are held here for drawing; the readout still prints the measured value.
 */
const MAX_DRAWN_ECCENTRICITY = 0.95;

/** Which tier a number in a placed orbit came from. */
export type ElementSource = "assumed" | "derived" | "measured";

export interface DistanceMapping {
  /** log10 of the semi-major axis at the middle of the drawn band. */
  centreLog10Au: number;
  /** How many decades of semi-major axis the band covers, end to end. */
  decades: number;
  /** Closest to the centre any radius may be drawn. See `DIORAMA_FLOOR_SCENE_UNITS`. */
  floorSceneUnits: number;
  innerSceneUnits: number;
  /** Largest measured semi-major axis in the system. */
  maxAu: number;
  /** Smallest measured semi-major axis in the system. */
  minAu: number;
  outerSceneUnits: number;
  /** True when the measured spread was narrower than `MIN_MAPPED_DECADES` and was not stretched. */
  widened: boolean;
}

export interface OrbitElements {
  eccentricity: number;
  eccentricitySource: Extract<ElementSource, "assumed" | "measured">;
  /** As the archive reports it: degrees from the plane of the sky, so 90 is edge-on. */
  inclinationDegrees: number;
  inclinationSource: Extract<ElementSource, "assumed" | "measured">;
  /** Null when nothing in the row could supply one, in which case the world is drawn parked. */
  periodDays: number | null;
  periodSource: Extract<ElementSource, "derived" | "measured"> | null;
  semiMajorAxisAu: number;
  semiMajorAxisSource: Extract<ElementSource, "derived" | "measured">;
}

export interface PlacedOrbit {
  /** DERIVED: the drawn radius of the body itself. */
  bodyRadiusSceneUnits: number;
  elements: OrbitElements;
  /** INFERRED: seeded from the planet id, because no catalog says where along its orbit it is. */
  phaseRadians: number;
  planet: ExoplanetProfile;
  radiusEarth: number;
  radiusEarthSource: Extract<ElementSource, "assumed" | "measured">;
  /** DERIVED: where the semi-major axis itself lands in the band. */
  semiMajorAxisSceneUnits: number;
  /**
   * DERIVED: how far this orbit is tilted out of the diorama's reference plane.
   *
   * The reference plane is the one an exactly edge-on orbit lies in, so the tilt is 90 degrees
   * minus the measured inclination. Transit photometry cannot tell an inclination from its
   * supplement, and the node that would say which way the orbit is turned is not catalogued at
   * all, so every tilt is taken about one shared line and comes out the same side.
   */
  tiltRadians: number;
}

export interface SystemLayout {
  /** How many times its true size an Earth-radius world is drawn. See `BODY_RADIUS_EXPONENT`. */
  bodyExaggeration: number;
  /** DERIVED: how many days of orbital motion one second of wall clock advances. */
  daysPerSecond: number;
  hostRadiusSceneUnits: number;
  hostRadiusSolar: number;
  hostRadiusSource: ElementSource;
  mapping: DistanceMapping;
  /** Placed worlds, innermost first. */
  orbits: readonly PlacedOrbit[];
  /** Worlds the archive places nowhere: no axis, and no period and host mass to derive one from. */
  unplaced: readonly ExoplanetProfile[];
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

/** A catalog number that is usable as a positive physical quantity, or null. */
const positive = (value: number | null): number | null =>
  value !== null && Number.isFinite(value) && value > 0 ? value : null;

export const semiMajorAxisFromPeriod = (periodDays: number, hostMassSolar: number): number =>
  (hostMassSolar * (periodDays / DAYS_PER_YEAR) ** 2) ** (1 / 3);

export const periodFromSemiMajorAxis = (semiMajorAxisAu: number, hostMassSolar: number): number =>
  Math.sqrt(semiMajorAxisAu ** 3 / hostMassSolar) * DAYS_PER_YEAR;

/**
 * Fits the diorama's radial band to a system's measured semi-major axes.
 *
 * Logarithmic, and normalised to the system rather than absolute, because the point of the view
 * is to be inside *this* system: an absolute scale would put TRAPPIST-1 entirely inside the star
 * and HR 8799 outside the room. The cost is that two systems are not comparable by eye, which is
 * why the interface prints the AU range every diorama was fitted to.
 */
export const deriveDistanceMapping = (
  semiMajorAxesAu: readonly number[],
  floorSceneUnits: number = DIORAMA_FLOOR_SCENE_UNITS,
): DistanceMapping => {
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

/**
 * Maps one distance from the star onto the diorama's radial band.
 *
 * Applied to every radius the renderer draws, not only to semi-major axes, so a point on an
 * eccentric orbit sits at the mapped distance the planet actually has there. The curve that
 * produces is not an ellipse, but the star stays at its focus and perihelion stays nearer than
 * aphelion by the measured amount, which is what the shape is there to show.
 */
export const mapDistance = (mapping: DistanceMapping, distanceAu: number): number => {
  if (!Number.isFinite(distanceAu) || distanceAu <= 0) return mapping.floorSceneUnits;
  const fraction = 0.5 + (Math.log10(distanceAu) - mapping.centreLog10Au) / mapping.decades;
  const span = mapping.outerSceneUnits - mapping.innerSceneUnits;
  return Math.max(mapping.floorSceneUnits, mapping.innerSceneUnits + span * fraction);
};

/** Drawn radius of a body from its measured radius in Earth radii. See `BODY_RADIUS_EXPONENT`. */
export const bodyRadiusSceneUnits = (radiusEarth: number): number =>
  clamp(
    EARTH_BODY_RADIUS_SCENE_UNITS * Math.max(radiusEarth, 1e-3) ** BODY_RADIUS_EXPONENT,
    0.045,
    1.5,
  );

/**
 * How many times its true size an Earth-radius world is drawn, at the outermost orbit.
 *
 * The comparison is against the one scale a reader can actually picture: if the outermost orbit
 * were drawn linearly at the radius it occupies, this is how much bigger than that an Earth is.
 */
export const bodyExaggeration = (mapping: DistanceMapping): number => {
  const sceneUnitsPerAu = mapDistance(mapping, mapping.maxAu) / mapping.maxAu;
  return EARTH_BODY_RADIUS_SCENE_UNITS / (EARTH_RADIUS_AU * sceneUnitsPerAu);
};

/**
 * The orbit the archive actually reports for a planet, with each part labelled by where it came
 * from. Null when the row places the planet nowhere at all.
 */
export const deriveOrbitElements = (planet: ExoplanetProfile): OrbitElements | null => {
  const observation = planet.observation;
  const measuredAxis = positive(observation.semiMajorAxisAu);
  const measuredPeriod = positive(observation.orbitalPeriodDays);
  const hostMassSolar = positive(observation.hostMassSolar);

  // Kepler's third law is established physics applied to two measured quantities, so an axis it
  // supplies is DERIVED rather than invented. Without a host mass there is nothing to apply.
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

  // Planetary-system catalogues conventionally measure inclination to their system's reference
  // plane, while an exoplanet transit catalogue measures it from the observer's sky. Convert the
  // former at this boundary so the shared diorama can keep one internal convention.
  const measuredInclination =
    planet.solarSystem?.orbitalInclinationDegrees === null || !planet.solarSystem
      ? observation.orbitalInclinationDegrees
      : 90 - planet.solarSystem.orbitalInclinationDegrees;
  const hasInclination = measuredInclination !== null && Number.isFinite(measuredInclination);

  return {
    // A circle is what the renderer has to draw without a measured shape, and `eccentricitySource`
    // is how it admits to it. The two are never conflated: zero here can mean either, and only the
    // source says which.
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

/**
 * How far an orbit is tilted out of the diorama's reference plane.
 *
 * A transit fixes how far an orbit is from edge-on but not which way it leans — an inclination
 * and its supplement produce the same light curve — so the two are folded together and every
 * tilt comes out on one side of the plane.
 */
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
  // Nothing measured this world's size. It still has to be drawn as something, so it is drawn as
  // an Earth and says so rather than being silently sized from its mass or its family.
  return { source: "assumed", value: 1 };
};

/** Solves Kepler's equation `E - e sin E = M` by Newton's method. */
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

/** Distance from the focus at a given true anomaly, in AU. */
export const orbitRadiusAu = (
  semiMajorAxisAu: number,
  eccentricity: number,
  trueAnomaly: number,
): number =>
  (semiMajorAxisAu * (1 - eccentricity ** 2)) / (1 + eccentricity * Math.cos(trueAnomaly));

/**
 * Where a world is on its orbit after `elapsedSeconds` of watching.
 *
 * A world the archive gave no period is parked at its seeded phase: it is on its measured orbit
 * and going nowhere, which is the honest depiction of an orbit nobody has timed.
 */
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

/**
 * The host star's radius in solar radii.
 *
 * NASA reports it for most hosts. When it does not, the same mass-radius relation worldgen uses
 * stands in, and when there is no mass either the star is drawn as a solar radius and says so.
 */
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

/**
 * Lays a host system out for the diorama.
 *
 * Every world the archive can place gets an orbit; the ones it cannot are handed back in
 * `unplaced` so the interface can name them rather than the renderer quietly dropping them.
 */
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
  // Pinned to the innermost orbit rather than to a fixed rate, so a system whose worlds go round
  // in days and one whose worlds take decades are both watchable. Relative periods are untouched,
  // which is what makes the third law visible as the outer worlds crawl.
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

/** What the radial band was fitted to, and where the measured extremes actually landed on it. */
export const orbitMappingLabel = ({ mapping }: SystemLayout): string =>
  `LOG · ${formatAu(mapping.minAu)}–${formatAu(mapping.maxAu)} AU → ${mapDistance(
    mapping,
    mapping.minAu,
  ).toFixed(1)}–${mapDistance(mapping, mapping.maxAu).toFixed(1)} m`;

/** The body scale, as the curve it is plus the one number a reader can hold on to. */
export const bodyScaleLabel = (layout: SystemLayout): string =>
  `r^${BODY_RADIUS_EXPONENT} · EARTH ×${formatCount(layout.bodyExaggeration)}`;

export const timeScaleLabel = (layout: SystemLayout): string =>
  `1 s = ${formatDays(layout.daysPerSecond)} d`;

/**
 * What had to be assumed to draw one orbit — and nothing when nothing did.
 *
 * Deliberately phrased as a list of admissions rather than a list of provenances, so a reader
 * scanning the system sees exactly which worlds are drawn from measurements and which are not.
 */
export const elementProvenance = (elements: OrbitElements): string => {
  const assumptions: string[] = [];
  if (elements.semiMajorAxisSource === "derived") assumptions.push("ORBIT SIZE FROM PERIOD");
  if (elements.eccentricitySource === "assumed") assumptions.push("SHAPE ASSUMED CIRCULAR");
  if (elements.inclinationSource === "assumed") assumptions.push("PLANE ASSUMED SHARED");
  if (elements.periodSource === "derived") assumptions.push("PERIOD FROM ORBIT SIZE");
  if (elements.periodSource === null) assumptions.push("UNTIMED · PARKED");
  return assumptions.length === 0 ? "ORBIT FULLY MEASURED" : assumptions.join(" · ");
};

/** One line per world for the readouts: what it is, how far out, and how long it takes. */
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
