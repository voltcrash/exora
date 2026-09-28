import type { ExoplanetProfile } from "@exora/contracts";
import { expect, test } from "vite-plus/test";
import { detectionFacts, hasTransited, readDetectionSignal } from "./detection-signal.ts";
import { featuredPlanet } from "./planet-profile.ts";

const NO_SIGNAL = {
  impactParameter: null,
  orbitalPeriodUncertaintyDays: null,
  radialVelocityAmplitudeMetersPerSecond: null,
  radiusRatio: null,
  transitDepthPercent: null,
  transitDurationHours: null,
  transitMidpointBjd: null,
  transitMidpointUncertaintyDays: null,
};

const world = (
  observation: Partial<ExoplanetProfile["observation"]>,
  kind: ExoplanetProfile["kind"] = "rocky",
): ExoplanetProfile => ({
  ...featuredPlanet,
  kind,
  observation: { ...featuredPlanet.observation, signal: NO_SIGNAL, ...observation },
});

// Earth seen transiting the Sun from outside: the yardstick every transit survey quotes.
const earth = world({
  discoveryMethod: "Transit",
  distanceParsecs: 10,
  hostMassSolar: 1,
  hostRadiusSolar: 1,
  massEarth: 1,
  massJupiter: null,
  massProvenance: "measured",
  orbitalEccentricity: 0.0167,
  orbitalInclinationDegrees: 90,
  orbitalPeriodDays: 365.256,
  radiusEarth: 1,
  radiusJupiter: null,
  radiusProvenance: "measured",
  semiMajorAxisAu: 1,
});

test("Earth crossing the Sun dims it 84 ppm for about thirteen hours", () => {
  const { transit } = readDetectionSignal(earth, 255);

  expect(transit?.depthSource).toBe("derived");
  expect(transit!.depth * 1e6).toBeCloseTo(84, 0);
  expect(transit!.durationHours).toBeCloseTo(13.1, 1);
  expect(transit?.impactParameter).toBeCloseTo(0, 6);
});

test("the Sun's reflex to Earth is nine centimetres a second", () => {
  const { velocity, transitProbability } = readDetectionSignal(earth, 255);

  expect(velocity?.source).toBe("derived");
  expect(velocity!.amplitudeMetersPerSecond).toBeCloseTo(0.0895, 3);
  expect(1 / transitProbability!).toBeCloseTo(215, -1);
});

test("Jupiter moves the Sun about 500 µas as seen from ten parsecs", () => {
  const jupiter = world(
    {
      distanceParsecs: 10,
      hostMassSolar: 1,
      massEarth: null,
      massJupiter: 1,
      massProvenance: "measured",
      semiMajorAxisAu: 5.2,
    },
    "gas-giant",
  );

  expect(readDetectionSignal(jupiter, null).astrometricMicroarcseconds).toBeCloseTo(497, -1);
});

test("51 Peg b's derived wobble lands on the one the archive measured", () => {
  const pegasi = world(
    {
      discoveryMethod: "Radial Velocity",
      hostMassSolar: 1.09,
      massEarth: 146.2,
      massJupiter: 0.46,
      massProvenance: "minimum",
      orbitalEccentricity: 0.01,
      orbitalInclinationDegrees: null,
      orbitalPeriodDays: 4.230785,
    },
    "gas-giant",
  );
  const derived = readDetectionSignal(pegasi, 1_260).velocity;

  expect(derived).toMatchObject({ lowerBound: true, source: "derived" });
  expect(derived!.amplitudeMetersPerSecond).toBeGreaterThan(55.77 * 0.95);
  expect(derived!.amplitudeMetersPerSecond).toBeLessThan(55.77 * 1.05);
  expect(readDetectionSignal(pegasi, 1_260).transit).toBeNull();
});

test("archive measurements are used verbatim ahead of anything derived", () => {
  const reading = readDetectionSignal(
    world({
      ...earth.observation,
      signal: {
        ...NO_SIGNAL,
        impactParameter: 0.507,
        radialVelocityAmplitudeMetersPerSecond: 84.7,
        radiusRatio: 0.12086,
        transitDepthPercent: 1.5,
        transitDurationHours: 3.072,
      },
    }),
    1_450,
  );

  expect(reading.transit).toMatchObject({
    depth: 0.015,
    depthSource: "measured",
    durationHours: 3.072,
    durationSource: "measured",
    impactParameter: 0.507,
    impactSource: "measured",
    radiusRatioSource: "measured",
  });
  expect(reading.velocity).toMatchObject({ amplitudeMetersPerSecond: 84.7, source: "measured" });
});

test("a scale height needs a weighed mass and a measured radius", () => {
  expect(readDetectionSignal(earth, 255).atmosphere?.scaleHeightKilometers).toBeCloseTo(7.5, 0);
  expect(
    readDetectionSignal(
      { ...earth, observation: { ...earth.observation, massProvenance: "estimated" } },
      255,
    ).atmosphere,
  ).toBeNull();
  expect(readDetectionSignal(earth, null).atmosphere).toBeNull();
});

test("a world never seen to transit reports only the odds that it could", () => {
  const imaged = world({ discoveryMethod: "Imaging", hostRadiusSolar: 1.77, semiMajorAxisAu: 92 });

  expect(hasTransited(imaged)).toBe(false);
  const facts = detectionFacts(imaged, readDetectionSignal(imaged, null));
  expect(facts.map((fact) => fact.label)).not.toContain("Transit depth");
  expect(facts.find((fact) => fact.label === "Transit odds")?.detail).toMatch(/not seen to/);
});

test("facts lead with how the world was found and qualify minimum masses", () => {
  const facts = detectionFacts(
    world({
      discoveryMethod: "Radial Velocity",
      discoveryYear: 1995,
      hostMassSolar: 1.09,
      massEarth: 146.2,
      massProvenance: "minimum",
      orbitalPeriodDays: 4.23,
    }),
    readDetectionSignal(
      world({
        hostMassSolar: 1.09,
        massEarth: 146.2,
        massProvenance: "minimum",
        orbitalPeriodDays: 4.23,
      }),
      null,
    ),
  );

  expect(facts[0]).toMatchObject({ label: "Found by", value: "Radial Velocity" });
  expect(facts.find((fact) => fact.label === "Star's wobble")?.value).toMatch(/^≥/);
});
