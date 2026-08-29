import type { z } from "zod";
import {
  apiErrorResponseSchema,
  blackHoleKindSchema,
  blackHoleMetadataSchema,
  blackHoleProfileSchema,
  blackHoleProvenanceSchema,
  blackHoleResponseSchema,
  blackHoleSearchResponseSchema,
  blackHoleStatusSchema,
  ephemerisResponseSchema,
  ephemerisVectorSchema,
  exoplanetObservationSchema,
  exoplanetProfileSchema,
  planetKindSchema,
  planetMetadataSchema,
  planetResponseSchema,
  planetSearchResponseSchema,
  solarSystemIdentitySchema,
  solarSystemSourceSchema,
  starKindSchema,
  starMetadataSchema,
  starObservationSchema,
  starProfileSchema,
  starResponseSchema,
  starSearchResponseSchema,
} from "./schemas.ts";

export type PlanetKind = z.infer<typeof planetKindSchema>;
export type SolarSystemIdentity = z.infer<typeof solarSystemIdentitySchema>;
export type SolarSystemSource = z.infer<typeof solarSystemSourceSchema>;
export type ExoplanetObservation = z.infer<typeof exoplanetObservationSchema>;
export type ExoplanetProfile = z.infer<typeof exoplanetProfileSchema>;
export type ApiMetadata = z.infer<typeof planetMetadataSchema>;
export type PlanetResponse = z.infer<typeof planetResponseSchema>;
export type PlanetSearchResponse = z.infer<typeof planetSearchResponseSchema>;

export type StarKind = z.infer<typeof starKindSchema>;
export type StarObservation = z.infer<typeof starObservationSchema>;
export type StarProfile = z.infer<typeof starProfileSchema>;
export type StarApiMetadata = z.infer<typeof starMetadataSchema>;
export type StarResponse = z.infer<typeof starResponseSchema>;
export type StarSearchResponse = z.infer<typeof starSearchResponseSchema>;

export type BlackHoleKind = z.infer<typeof blackHoleKindSchema>;
export type BlackHoleProvenance = z.infer<typeof blackHoleProvenanceSchema>;
export type BlackHoleStatus = z.infer<typeof blackHoleStatusSchema>;
export type BlackHoleProfile = z.infer<typeof blackHoleProfileSchema>;
export type BlackHoleApiMetadata = z.infer<typeof blackHoleMetadataSchema>;
export type BlackHoleResponse = z.infer<typeof blackHoleResponseSchema>;
export type BlackHoleSearchResponse = z.infer<typeof blackHoleSearchResponseSchema>;

export type EphemerisVector = z.infer<typeof ephemerisVectorSchema>;
export type EphemerisResponse = z.infer<typeof ephemerisResponseSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export type ContractSchema = z.ZodType;
export type SchemaOutput<Schema extends ContractSchema> = z.infer<Schema>;

export * from "./schemas.ts";
export { FEATURED_BLACK_HOLES } from "./featured-black-holes.ts";
