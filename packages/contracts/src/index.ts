import type { z } from "zod";
import {
  apiErrorResponseSchema,
  apiResponseSchemas,
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

export type EphemerisVector = z.infer<typeof ephemerisVectorSchema>;
export type EphemerisResponse = z.infer<typeof ephemerisResponseSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export type ApiResponseName = keyof typeof apiResponseSchemas;
export type ApiResponse<Name extends ApiResponseName> = z.infer<(typeof apiResponseSchemas)[Name]>;
export type ContractSchema = z.ZodType;
export type SchemaOutput<Schema extends ContractSchema> = z.infer<Schema>;

export * from "./schemas.ts";
