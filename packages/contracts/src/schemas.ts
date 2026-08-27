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
  archive: z.enum(["NASA/JPL Small-Body Database", "NASA/JPL Solar System Dynamics"]),
  retrievedOn: retrievedDate,
  table: z.enum([
    "planetary-physical-parameters",
    "planetary-satellite-physical-parameters",
    "sbdb-api-v1.3",
  ]),
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

export const missionTrajectoryPointSchema = z.strictObject({
  calendarTdb: z.string().includes("TDB"),
  julianDateTdb: finiteNumber,
  positionAu: vectorSchema,
  velocityAuPerDay: vectorSchema,
});

export const missionTrajectoryResponseSchema = z.strictObject({
  data: z.array(missionTrajectoryPointSchema).min(2).max(400),
  meta: z.strictObject({
    cached: z.boolean(),
    center: z.literal("Sun (10)"),
    coordinateFrame: z.literal("Ecliptic J2000"),
    retrievedAt: timestamp,
    solution: nonEmptyString,
    source: z.literal("NASA/JPL Horizons API"),
    sourceVersion: nonEmptyString,
    spkId: nonEmptyString,
    stale: z.boolean(),
    stepDays: z.number().int().positive(),
    targetName: nonEmptyString,
  }),
});

export const smallBodyParameterSchema = z.strictObject({
  name: nonEmptyString,
  reference: nullableString,
  title: nonEmptyString,
  uncertainty: nullableString,
  units: nullableString,
  value: nonEmptyString,
});

export const smallBodyCloseApproachSchema = z.strictObject({
  body: nonEmptyString,
  calendarDate: nonEmptyString,
  distanceAu: finiteNumber,
  distanceMaximumAu: nullableFiniteNumber,
  distanceMinimumAu: nullableFiniteNumber,
  julianDate: nullableFiniteNumber,
  relativeVelocityKilometersPerSecond: nullableFiniteNumber,
  timeUncertaintySeconds: nullableFiniteNumber,
});

export const smallBodyKindSchema = z.enum(["asteroid", "comet"]);
export const smallBodyLookupSchema = z.enum(["auto", "designation", "spk"]);

export const smallBodyProfileSchema = z.strictObject({
  closeApproaches: z.array(smallBodyCloseApproachSchema),
  designation: nonEmptyString,
  fullName: nonEmptyString,
  kind: smallBodyKindSchema,
  nearEarth: z.boolean().nullable(),
  orbit: z.strictObject({
    conditionCode: nullableString,
    dataArcDays: nullableFiniteNumber,
    elements: z.array(smallBodyParameterSchema),
    epochJulianDate: nullableFiniteNumber,
    firstObservation: nullableString,
    lastObservation: nullableString,
    solutionDate: nullableString,
    solutionId: nullableString,
  }),
  orbitClass: z.strictObject({ code: nonEmptyString, name: nonEmptyString }).nullable(),
  physicalParameters: z.array(smallBodyParameterSchema),
  potentiallyHazardous: z.boolean().nullable(),
  spkId: nonEmptyString,
});

export const smallBodyMatchSchema = z.strictObject({
  designation: nonEmptyString,
  name: nonEmptyString,
});

export const smallBodySearchResponseSchema = z
  .strictObject({
    data: smallBodyProfileSchema.nullable(),
    matches: z.array(smallBodyMatchSchema),
    meta: z.strictObject({
      cached: z.boolean(),
      lookup: smallBodyLookupSchema,
      query: nonEmptyString,
      retrievedAt: timestamp,
      source: z.literal("NASA/JPL Small-Body Database (SBDB) API"),
      sourceVersion: nonEmptyString,
      stale: z.boolean(),
      status: z.enum(["ambiguous", "match", "not-found"]),
    }),
  })
  .superRefine((value, context) => {
    if (value.meta.status === "match" && value.data === null) {
      context.addIssue({ code: "custom", message: "A matched small body requires data." });
    }
    if (value.meta.status !== "match" && value.data !== null) {
      context.addIssue({ code: "custom", message: "Only a matched small body may include data." });
    }
  });

export const apiErrorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(["INVALID_REQUEST", "NOT_FOUND", "RATE_LIMITED", "UPSTREAM_UNAVAILABLE"]),
    message: nonEmptyString,
  }),
});

/** Named response schemas used by both runtime validation and the OpenAPI document. */
export const apiResponseSchemas = {
  ApiError: apiErrorResponseSchema,
  Ephemeris: ephemerisResponseSchema,
  MissionTrajectory: missionTrajectoryResponseSchema,
  Planet: planetResponseSchema,
  PlanetSearch: planetSearchResponseSchema,
  SmallBodySearch: smallBodySearchResponseSchema,
  Star: starResponseSchema,
  StarSearch: starSearchResponseSchema,
} as const;
