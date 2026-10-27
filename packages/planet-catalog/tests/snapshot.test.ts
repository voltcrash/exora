import { exoplanetProfileSchema, type ExoplanetProfile } from "@exora/contracts";
import { expect, test } from "vite-plus/test";
import {
  decodePlanetCatalog,
  encodePlanetCatalog,
  PLANET_CATALOG_FIELDS,
  type PlanetCatalogSnapshot,
} from "../src/index.ts";

const profile: ExoplanetProfile = {
  id: "kepler-18-b",
  name: "Kepler-18 b",
  hostStar: "Kepler-18",
  kind: "ice-giant",
  observation: {
    radiusJupiter: 0.178,
    massJupiter: null,
    radiusEarth: 2,
    massEarth: 6.9,
    massProvenance: "measured",
    radiusProvenance: null,
    equilibriumTemperatureKelvin: 1172,
    orbitalEccentricity: 0,
    orbitalInclinationDegrees: 84.92,
    orbitalPeriodDays: 3.504725,
    semiMajorAxisAu: 0.0447,
    distanceParsecs: 435.1,
    rightAscensionDegrees: 297.6,
    declinationDegrees: 44.73,
    discoveryYear: 2011,
    discoveryMethod: "Transit",
    hostSpectralType: null,
    hostTemperatureKelvin: 5345,
    hostRadiusSolar: 1.108,
    hostMassSolar: 0.972,
    hostLuminosityLogSolar: -0.05,
    signal: {
      impactParameter: 0.56,
      orbitalPeriodUncertaintyDays: 0.0000062,
      radialVelocityAmplitudeMetersPerSecond: null,
      radiusRatio: 0.0187,
      transitDepthPercent: 0.024,
      transitDurationHours: 3.06,
      transitMidpointBjd: 2454966.5,
      transitMidpointUncertaintyDays: null,
    },
  },
  source: { archive: "NASA Exoplanet Archive", table: "pscomppars", retrievedOn: "2026-10-27" },
};

const metadata = {
  endpoint: "https://exoplanetarchive.ipac.caltech.edu/TAP/sync",
  generatedAt: "2026-10-27T05:00:00.000Z",
  query: "select pl_name from pscomppars order by pl_name",
};

test("profiles round-trip through the compact rows with blanks kept as null", () => {
  const snapshot = encodePlanetCatalog([profile], metadata);
  expect(snapshot.fields).toEqual(PLANET_CATALOG_FIELDS);
  expect(snapshot.rows[0]).toHaveLength(PLANET_CATALOG_FIELDS.length);
  expect(snapshot.rows[0]).toContain(null);
  const [decoded] = decodePlanetCatalog(JSON.parse(JSON.stringify(snapshot)));
  expect(decoded).toEqual(profile);
  expect(exoplanetProfileSchema.parse(decoded)).toEqual(profile);
});

test("rows follow the snapshot's own field order and date their source by generation", () => {
  const snapshot: PlanetCatalogSnapshot = {
    ...encodePlanetCatalog([profile], { ...metadata, generatedAt: "2026-11-02T05:00:00.000Z" }),
  };
  const reversed = {
    ...snapshot,
    fields: [...snapshot.fields].reverse(),
    rows: snapshot.rows.map((row) => [...row].reverse()),
  };
  const [decoded] = decodePlanetCatalog(reversed);
  expect(decoded).toEqual({ ...profile, source: { ...profile.source, retrievedOn: "2026-11-02" } });
});

test("an unknown snapshot format is refused rather than misread", () => {
  const snapshot = encodePlanetCatalog([profile], metadata);
  expect(() => decodePlanetCatalog({ ...snapshot, format: 2 } as never)).toThrow(
    "Unsupported planet catalog snapshot format.",
  );
});
