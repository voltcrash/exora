import { z } from "zod";

const finiteNumber = z.number().finite();
const nonEmptyString = z.string().min(1);
const nullableFiniteNumber = finiteNumber.nullable();
const nullableString = z.string().nullable();
const retrievedDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timestamp = z.string().min(1);

const vectorSchema = z.strictObject({
  x: finiteNumber,
  y: finiteNumber,
  z: finiteNumber,
});

export const solarSystemSourceSchema = z.strictObject({
  archive: z.literal("NASA/JPL Solar System Dynamics"),
  retrievedOn: retrievedDate,
  table: z.enum(["planetary-physical-parameters", "planetary-satellite-physical-parameters"]),
});

export const solarSystemIdentitySchema = z.strictObject({
  axialTiltDegrees: nullableFiniteNumber,
  bodyType: z.enum(["dwarf-planet", "moon", "planet", "star"]),
  dimensionsKilometers: z.tuple([finiteNumber, finiteNumber, finiteNumber]).readonly().optional(),
  naifId: z.number().int(),
  orbitalInclinationDegrees: nullableFiniteNumber,
  orbitalPeriodDays: nullableFiniteNumber.optional(),
  orbitalSemiMajorAxisKilometers: nullableFiniteNumber.optional(),
  parent: nullableString,
  rotationPeriodHours: nullableFiniteNumber,
  spkId: nonEmptyString.optional(),
  summary: nonEmptyString,
  surfaceNote: nonEmptyString.optional(),
  surfaceStatus: z.enum(["mapped", "modeled", "unresolved"]).optional(),
  texture: z
    .strictObject({
      credit: nonEmptyString,
      license: nonEmptyString.optional(),
      mission: nonEmptyString.optional(),
      originalUrl: nonEmptyString.optional(),
      path: nonEmptyString,
      retrievedOn: retrievedDate.optional(),
      sourceUrl: nonEmptyString,
      topography: z
        .strictObject({
          credit: nonEmptyString,
          license: nonEmptyString,
          originalUrl: nonEmptyString,
          path: nonEmptyString,
          reliefScale: finiteNumber,
          retrievalDate: retrievedDate,
        })
        .optional(),
    })
    .optional(),
});

export const planetKindSchema = z.enum(["gas-giant", "ice-giant", "rocky", "unknown"]);

export const exoplanetObservationSchema = z.strictObject({
  declinationDegrees: nullableFiniteNumber,
  discoveryMethod: nonEmptyString,
  discoveryYear: nullableFiniteNumber,
  distanceParsecs: nullableFiniteNumber,
  equilibriumTemperatureKelvin: nullableFiniteNumber,
  hostLuminosityLogSolar: nullableFiniteNumber,
  hostMassSolar: nullableFiniteNumber,
  hostRadiusSolar: nullableFiniteNumber,
  hostSpectralType: nullableString,
  hostTemperatureKelvin: nullableFiniteNumber,
  massEarth: nullableFiniteNumber,
  massJupiter: nullableFiniteNumber,
  orbitalEccentricity: nullableFiniteNumber,
  orbitalInclinationDegrees: nullableFiniteNumber,
  orbitalPeriodDays: nullableFiniteNumber,
  radiusEarth: nullableFiniteNumber,
  radiusJupiter: nullableFiniteNumber,
  rightAscensionDegrees: nullableFiniteNumber,
  semiMajorAxisAu: nullableFiniteNumber,
});

const exoplanetSourceSchema = z.union([
  z.strictObject({
    archive: z.literal("NASA Exoplanet Archive"),
    retrievedOn: retrievedDate,
    table: z.literal("pscomppars"),
  }),
  z.strictObject({
    archive: z.literal("Exora Custom Generator"),
    retrievedOn: retrievedDate,
    table: z.literal("procedural"),
  }),
  solarSystemSourceSchema,
]);

export const exoplanetProfileSchema = z.strictObject({
  hostStar: nonEmptyString,
  id: nonEmptyString,
  kind: planetKindSchema,
  name: nonEmptyString,
  observation: exoplanetObservationSchema,
  solarSystem: solarSystemIdentitySchema.optional(),
  source: exoplanetSourceSchema,
});

export const planetMetadataSchema = z.strictObject({
  cached: z.boolean(),
  source: z.literal("NASA Exoplanet Archive"),
});

export const planetResponseSchema = z.strictObject({
  data: exoplanetProfileSchema,
  meta: planetMetadataSchema,
});

export const planetSearchResponseSchema = z.strictObject({
  data: z.array(exoplanetProfileSchema),
  meta: planetMetadataSchema.extend({
    count: z.number().int().nonnegative(),
    query: z.string(),
  }),
});

export const starKindSchema = z.enum([
  "binary",
  "evolved",
  "main-sequence",
  "neutron-star",
  "star",
  "variable",
  "white-dwarf",
]);

export const starObservationSchema = z.strictObject({
  declinationDegrees: nullableFiniteNumber,
  diameterKilometers: nullableFiniteNumber.optional(),
  distanceParsecs: nullableFiniteNumber,
  effectiveTemperatureKelvin: nullableFiniteNumber.optional(),
  gaiaMagnitude: nullableFiniteNumber,
  parallaxMas: nullableFiniteNumber,
  properMotionDecMasPerYear: nullableFiniteNumber,
  properMotionRaMasPerYear: nullableFiniteNumber,
  radialVelocityKmPerSecond: nullableFiniteNumber,
  rightAscensionDegrees: nullableFiniteNumber,
  spectralType: nullableString,
  visualMagnitude: nullableFiniteNumber,
});

const starSourceSchema = z.union([
  z.strictObject({
    archive: z.literal("SIMBAD"),
    retrievedOn: retrievedDate,
    tables: z.union([
      z.tuple([z.literal("basic"), z.literal("ident"), z.literal("allfluxes")]).readonly(),
      z
        .tuple([
          z.literal("basic"),
          z.literal("ident"),
          z.literal("allfluxes"),
          z.literal("mesDiameter"),
          z.literal("mesFe_h"),
        ])
        .readonly(),
    ]),
  }),
  z.strictObject({
    archive: z.literal("Exora Custom Generator"),
    retrievedOn: retrievedDate,
    table: z.literal("procedural"),
  }),
  solarSystemSourceSchema,
]);

export const starProfileSchema = z.strictObject({
  aliases: z.array(nonEmptyString).readonly().optional(),
  catalogName: nonEmptyString,
  customization: z
    .strictObject({
      activity: finiteNumber,
      radius: finiteNumber,
      rotation: finiteNumber,
      seed: finiteNumber,
      temperatureKelvin: finiteNumber,
    })
    .optional(),
  id: nonEmptyString,
  kind: starKindSchema,
  name: nonEmptyString,
  objectType: nonEmptyString,
  observation: starObservationSchema,
  solarSystem: solarSystemIdentitySchema.optional(),
  source: starSourceSchema,
});

export const starMetadataSchema = z.strictObject({
  cached: z.boolean(),
  source: z.literal("SIMBAD"),
});

export const starResponseSchema = z.strictObject({
  data: starProfileSchema,
  meta: starMetadataSchema,
});

export const starSearchResponseSchema = z.strictObject({
  data: z.array(starProfileSchema),
  meta: starMetadataSchema.extend({
    count: z.number().int().nonnegative(),
    query: z.string(),
  }),
});

export const blackHoleKindSchema = z.enum([
  "stellar-mass",
  "intermediate-mass",
  "supermassive",
  "ultramassive",
]);

export const blackHoleProvenanceSchema = z.enum(["observed", "procedural"]);
export const blackHoleStatusSchema = z.enum(["confirmed", "candidate", "synthetic"]);

export const blackHoleProfileSchema = z.strictObject({
  aliases: z.array(nonEmptyString).readonly(),
  catalogDesignation: nonEmptyString,
  constellation: nullableString,
  distanceLightYears: nullableFiniteNumber,
  host: nonEmptyString,
  id: nonEmptyString,
  kind: blackHoleKindSchema,
  massSolar: nullableFiniteNumber,
  massUncertaintySolar: nullableFiniteNumber,
  milestone: nonEmptyString,
  name: nonEmptyString,
  observation: z.strictObject({
    accretion: z.enum(["active", "dormant", "quiet"]),
    companion: nullableString,
    declinationDegrees: nullableFiniteNumber,
    redshift: nullableFiniteNumber,
    rightAscensionDegrees: nullableFiniteNumber,
    summary: nonEmptyString,
  }),
  provenance: blackHoleProvenanceSchema,
  source: z.strictObject({
    archive: nonEmptyString,
    catalog: nonEmptyString,
    measurement: nonEmptyString,
    retrievedOn: retrievedDate,
    title: nonEmptyString,
    url: z.url().optional(),
  }),
  status: blackHoleStatusSchema,
  visual: z.strictObject({
    diskActivity: finiteNumber.min(0).max(1),
    diskHueDegrees: finiteNumber.min(0).max(360),
    diskTiltDegrees: finiteNumber.min(0).max(90),
    jetStrength: finiteNumber.min(0).max(1),
    seed: finiteNumber,
  }),
});

export const blackHoleMetadataSchema = z.strictObject({
  cached: z.boolean(),
  source: z.enum(["BlackCAT / CDS VizieR", "Exora curated featured"]),
  stale: z.boolean(),
});

export const blackHoleResponseSchema = z.strictObject({
  data: blackHoleProfileSchema,
  meta: blackHoleMetadataSchema,
});

export const blackHoleSearchResponseSchema = z.strictObject({
  data: z.array(blackHoleProfileSchema),
  meta: blackHoleMetadataSchema.extend({
    count: z.number().int().nonnegative(),
    query: z.string(),
  }),
});

export const ephemerisVectorSchema = z.strictObject({
  epoch: timestamp,
  name: nonEmptyString,
  naifId: z.number().int(),
  positionAu: vectorSchema,
  solution: nonEmptyString,
  spkId: nonEmptyString,
  velocityAuPerDay: vectorSchema,
});

export const ephemerisResponseSchema = z.strictObject({
  data: z.array(ephemerisVectorSchema).min(1),
  meta: z.strictObject({
    cached: z.boolean(),
    center: z.literal("Sun (10)"),
    coordinateFrame: z.literal("Ecliptic J2000"),
    epoch: timestamp,
    retrievedAt: timestamp,
    source: z.literal("NASA/JPL Horizons API"),
    sourceVersion: nonEmptyString,
    stale: z.boolean(),
  }),
});

export const apiErrorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(["INVALID_REQUEST", "NOT_FOUND", "RATE_LIMITED", "UPSTREAM_UNAVAILABLE"]),
    message: nonEmptyString,
  }),
});
