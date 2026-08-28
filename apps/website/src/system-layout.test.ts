import type { ExoplanetProfile } from "@exora/contracts";
import { expect, test } from "vite-plus/test";
import {
  bodyExaggeration,
  bodyRadiusSceneUnits,
  deriveDistanceMapping,
  deriveOrbitElements,
  deriveSystemLayout,
  DIORAMA_FLOOR_SCENE_UNITS,
  DIORAMA_INNER_SCENE_UNITS,
  DIORAMA_OUTER_SCENE_UNITS,
  eccentricAnomaly,
  elementProvenance,
  INNERMOST_ORBIT_SECONDS,
  mapDistance,
  MIN_MAPPED_DECADES,
  orbitMappingLabel,
  orbitRadiusAu,
  orbitStateAt,
  orbitTiltRadians,
  periodFromSemiMajorAxis,
  semiMajorAxisFromPeriod,
  timeScaleLabel,
  trueAnomalyFromEccentric,
} from "./system-layout.ts";

const world = (
  name: string,
  observation: Partial<ExoplanetProfile["observation"]>,
): ExoplanetProfile => ({
  id: name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-"),
  name,
  hostStar: "Test Host",
  kind: "rocky",
  observation: {
    declinationDegrees: 45,
    distanceParsecs: 12,
    discoveryMethod: "Transit",
    discoveryYear: 2019,
    equilibriumTemperatureKelvin: 300,
    hostLuminosityLogSolar: -0.4,
    hostMassSolar: 0.9,
    hostRadiusSolar: 0.86,
    hostSpectralType: "K0V",
    hostTemperatureKelvin: 5_100,
    massEarth: 1.1,
    massJupiter: null,
    orbitalEccentricity: null,
    orbitalInclinationDegrees: null,
    orbitalPeriodDays: null,
    radiusEarth: 1.05,
    radiusJupiter: null,
    rightAscensionDegrees: 210,
    semiMajorAxisAu: null,
    ...observation,
  },
  source: { archive: "NASA Exoplanet Archive", retrievedOn: "2026-08-22", table: "pscomppars" },
});

test("the measured extremes land on the ends of the radial band", () => {
  const mapping = deriveDistanceMapping([0.05, 0.3, 1.2]);

  expect(mapDistance(mapping, 0.05)).toBeCloseTo(DIORAMA_INNER_SCENE_UNITS, 6);
  expect(mapDistance(mapping, 1.2)).toBeCloseTo(DIORAMA_OUTER_SCENE_UNITS, 6);
  expect(mapping.widened).toBe(false);
});

test("a compact system is drawn inside the band rather than stretched across it", () => {
  const mapping = deriveDistanceMapping([0.02, 0.021, 0.022, 0.023]);

  expect(mapping.widened).toBe(true);
  expect(mapping.decades).toBe(MIN_MAPPED_DECADES);
  expect(mapDistance(mapping, 0.02)).toBeGreaterThan(DIORAMA_INNER_SCENE_UNITS);
  expect(mapDistance(mapping, 0.023)).toBeLessThan(DIORAMA_OUTER_SCENE_UNITS);
  const centre = (DIORAMA_INNER_SCENE_UNITS + DIORAMA_OUTER_SCENE_UNITS) / 2;
  expect((mapDistance(mapping, 0.02) + mapDistance(mapping, 0.023)) / 2).toBeCloseTo(centre, 6);
});

test("a lone world sits in the middle of the band instead of dividing by a zero span", () => {
  const mapping = deriveDistanceMapping([0.4]);
  const centre = (DIORAMA_INNER_SCENE_UNITS + DIORAMA_OUTER_SCENE_UNITS) / 2;

  expect(Number.isFinite(mapDistance(mapping, 0.4))).toBe(true);
  expect(mapDistance(mapping, 0.4)).toBeCloseTo(centre, 6);
});

test("the mapping rises with distance and never draws through the star", () => {
  const mapping = deriveDistanceMapping([0.05, 1.2]);

  expect(mapDistance(mapping, 0.5)).toBeGreaterThan(mapDistance(mapping, 0.2));
  expect(mapDistance(mapping, 1e-6)).toBe(DIORAMA_FLOOR_SCENE_UNITS);
  expect(mapDistance(mapping, 0)).toBe(DIORAMA_FLOOR_SCENE_UNITS);
});

test("the floor is held clear of the host star's own disc, however large it is drawn", () => {
  const giant = deriveSystemLayout([
    world("Giant host b", { hostRadiusSolar: 900, orbitalEccentricity: 0.9, semiMajorAxisAu: 3 }),
  ]);

  expect(giant.mapping.floorSceneUnits).toBeGreaterThan(giant.hostRadiusSceneUnits);
  expect(mapDistance(giant.mapping, 1e-9)).toBeGreaterThan(giant.hostRadiusSceneUnits);
});

test("Kepler's third law round-trips between an orbit size and a period", () => {
  const period = periodFromSemiMajorAxis(1, 1);

  expect(period).toBeCloseTo(365.25, 6);
  expect(semiMajorAxisFromPeriod(period, 1)).toBeCloseTo(1, 9);
});

test("a measured orbit is reported as measured, with nothing assumed", () => {
  const elements = deriveOrbitElements(
    world("Measured b", {
      orbitalEccentricity: 0.21,
      orbitalInclinationDegrees: 87.4,
      orbitalPeriodDays: 41.2,
      semiMajorAxisAu: 0.23,
    }),
  );

  expect(elements).toMatchObject({
    eccentricity: 0.21,
    eccentricitySource: "measured",
    inclinationDegrees: 87.4,
    inclinationSource: "measured",
    periodDays: 41.2,
    periodSource: "measured",
    semiMajorAxisAu: 0.23,
    semiMajorAxisSource: "measured",
  });
  expect(elements && elementProvenance(elements)).toBe("ORBIT FULLY MEASURED");
});

test("a missing shape or plane is drawn as a circle in the shared plane and says so", () => {
  const elements = deriveOrbitElements(world("Bare b", { semiMajorAxisAu: 0.4 }));

  expect(elements).toMatchObject({
    eccentricity: 0,
    eccentricitySource: "assumed",
    inclinationSource: "assumed",
  });
  expect(elements && orbitTiltRadians(elements.inclinationDegrees)).toBe(0);
  expect(elements && elementProvenance(elements)).toContain("SHAPE ASSUMED CIRCULAR");
  expect(elements && elementProvenance(elements)).toContain("PLANE ASSUMED SHARED");
});

test("a measured circular orbit is not confused with one that was never solved", () => {
  const measured = deriveOrbitElements(
    world("Circular b", { orbitalEccentricity: 0, semiMajorAxisAu: 0.4 }),
  );

  expect(measured?.eccentricity).toBe(0);
  expect(measured?.eccentricitySource).toBe("measured");
});

test("an unreported orbit size is derived from the period and the host mass", () => {
  const elements = deriveOrbitElements(
    world("Timed b", { hostMassSolar: 1, orbitalPeriodDays: 365.25 }),
  );

  expect(elements?.semiMajorAxisSource).toBe("derived");
  expect(elements?.semiMajorAxisAu).toBeCloseTo(1, 9);
  expect(elements && elementProvenance(elements)).toContain("ORBIT SIZE FROM PERIOD");
});

test("an untimed orbit borrows a period from its size, or admits it has none", () => {
  const derived = deriveOrbitElements(world("Sized b", { hostMassSolar: 1, semiMajorAxisAu: 1 }));
  expect(derived?.periodSource).toBe("derived");
  expect(derived?.periodDays).toBeCloseTo(365.25, 6);

  const untimed = deriveOrbitElements(
    world("Untimed b", { hostMassSolar: null, semiMajorAxisAu: 1 }),
  );
  expect(untimed?.periodDays).toBe(null);
  expect(untimed && elementProvenance(untimed)).toContain("UNTIMED · PARKED");
});

test("a world the archive places nowhere is not placed anywhere", () => {
  expect(deriveOrbitElements(world("Nowhere b", { hostMassSolar: null }))).toBe(null);
  expect(
    deriveOrbitElements(world("Nowhere c", { hostMassSolar: null, orbitalPeriodDays: 12 })),
  ).toBe(null);
});

test("an inclination and its supplement produce the same tilt, because a transit cannot tell them apart", () => {
  expect(orbitTiltRadians(87)).toBeCloseTo(orbitTiltRadians(93), 12);
  expect(orbitTiltRadians(90)).toBe(0);
  expect(orbitTiltRadians(80)).toBeCloseTo((10 * Math.PI) / 180, 12);
});

test("a circular orbit sweeps at a constant radius and an eccentric one does not", () => {
  expect(trueAnomalyFromEccentric(eccentricAnomaly(1.1, 0), 0)).toBeCloseTo(1.1, 9);
  expect(orbitRadiusAu(1, 0, 2.4)).toBeCloseTo(1, 9);

  expect(orbitRadiusAu(1, 0.4, 0)).toBeCloseTo(0.6, 9);
  expect(orbitRadiusAu(1, 0.4, Math.PI)).toBeCloseTo(1.4, 9);
});

test("Kepler's equation is solved to the true anomaly at both ends of the ellipse", () => {
  for (const eccentricity of [0, 0.3, 0.7, 0.94]) {
    expect(trueAnomalyFromEccentric(eccentricAnomaly(0, eccentricity), eccentricity)).toBeCloseTo(
      0,
      9,
    );
    expect(
      Math.abs(trueAnomalyFromEccentric(eccentricAnomaly(Math.PI, eccentricity), eccentricity)),
    ).toBeCloseTo(Math.PI, 6);
    const anomaly = eccentricAnomaly(2.2, eccentricity);
    expect(anomaly - eccentricity * Math.sin(anomaly)).toBeCloseTo(2.2, 9);
  }
});

test("a world returns to where it started after one of its own periods", () => {
  const layout = deriveSystemLayout([
    world("Cycle b", {
      orbitalEccentricity: 0.35,
      orbitalPeriodDays: 20,
      semiMajorAxisAu: 0.15,
    }),
  ]);
  const orbit = layout.orbits[0];
  if (!orbit) throw new Error("Expected one placed orbit.");

  const start = orbitStateAt(orbit, 0, layout.daysPerSecond);
  const later = orbitStateAt(orbit, 20 / layout.daysPerSecond, layout.daysPerSecond);

  expect(later.radiusAu).toBeCloseTo(start.radiusAu, 6);
});

test("an untimed world stays parked on its measured orbit", () => {
  const layout = deriveSystemLayout([
    world("Parked b", { hostMassSolar: null, semiMajorAxisAu: 2 }),
  ]);
  const orbit = layout.orbits[0];
  if (!orbit) throw new Error("Expected one placed orbit.");

  expect(orbitStateAt(orbit, 0, layout.daysPerSecond).trueAnomaly).toBeCloseTo(
    orbitStateAt(orbit, 240, layout.daysPerSecond).trueAnomaly,
    9,
  );
});

test("a system is laid out innermost first, keeping the worlds it cannot place", () => {
  const layout = deriveSystemLayout([
    world("Outer d", { orbitalPeriodDays: 300, semiMajorAxisAu: 1.1 }),
    world("Inner b", { orbitalPeriodDays: 4, semiMajorAxisAu: 0.05 }),
    world("Nowhere e", { hostMassSolar: null }),
    world("Middle c", { orbitalPeriodDays: 40, semiMajorAxisAu: 0.24 }),
  ]);

  expect(layout.orbits.map(({ planet }) => planet.name)).toEqual([
    "Inner b",
    "Middle c",
    "Outer d",
  ]);
  expect(layout.unplaced.map(({ name }) => name)).toEqual(["Nowhere e"]);
  expect(layout.daysPerSecond).toBeCloseTo(4 / INNERMOST_ORBIT_SECONDS, 9);
});

test("the same system always lays out the same way", () => {
  const planets = [
    world("Repeat b", { orbitalPeriodDays: 4, semiMajorAxisAu: 0.05 }),
    world("Repeat c", { orbitalPeriodDays: 40, semiMajorAxisAu: 0.24 }),
  ];

  expect(deriveSystemLayout(planets)).toEqual(deriveSystemLayout(planets));
});

test("bodies keep their size ordering while the range is compressed", () => {
  const earth = bodyRadiusSceneUnits(1);
  const jupiter = bodyRadiusSceneUnits(11.2);
  const star = bodyRadiusSceneUnits(109.1);

  expect(jupiter).toBeGreaterThan(earth);
  expect(star).toBeGreaterThan(jupiter);
  expect(star / earth).toBeLessThan(20);
});

test("an unmeasured planet radius is drawn as an Earth and reports itself as assumed", () => {
  const layout = deriveSystemLayout([
    world("Sizeless b", { radiusEarth: null, radiusJupiter: null, semiMajorAxisAu: 0.3 }),
  ]);

  expect(layout.orbits[0]?.radiusEarth).toBe(1);
  expect(layout.orbits[0]?.radiusEarthSource).toBe("assumed");
});

test("the host radius falls back through the mass relation before it is assumed", () => {
  expect(deriveSystemLayout([world("Host b", { semiMajorAxisAu: 1 })]).hostRadiusSource).toBe(
    "measured",
  );
  expect(
    deriveSystemLayout([world("Host b", { hostRadiusSolar: null, semiMajorAxisAu: 1 })])
      .hostRadiusSource,
  ).toBe("derived");
  expect(
    deriveSystemLayout([
      world("Host b", { hostMassSolar: null, hostRadiusSolar: null, semiMajorAxisAu: 1 }),
    ]).hostRadiusSource,
  ).toBe("assumed");
});

test("the readouts state the compressions rather than leaving the layout to look linear", () => {
  const layout = deriveSystemLayout([
    world("Read b", { orbitalPeriodDays: 4, semiMajorAxisAu: 0.05 }),
    world("Read c", { orbitalPeriodDays: 400, semiMajorAxisAu: 1.2 }),
  ]);

  expect(orbitMappingLabel(layout)).toBe("LOG · 0.050–1.20 AU → 3.0–13.0 m");
  expect(timeScaleLabel(layout)).toBe("1 s = 0.444 d");
  expect(bodyExaggeration(layout.mapping)).toBeGreaterThan(100);
});
