import { expect, expectTypeOf, test } from "vite-plus/test";
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
  type ApiErrorResponse,
  type ApiMetadata,
  type ApiResponse,
  type EphemerisResponse,
  type EphemerisVector,
  type ExoplanetObservation,
  type ExoplanetProfile,
  type PlanetKind,
  type PlanetResponse,
  type PlanetSearchResponse,
  type SolarSystemIdentity,
  type SolarSystemSource,
  type StarApiMetadata,
  type StarKind,
  type StarObservation,
  type StarProfile,
  type StarResponse,
  type StarSearchResponse,
} from "./index.ts";

test("exports contract types inferred from their schemas", () => {
  expectTypeOf<PlanetKind>().toEqualTypeOf<z.infer<typeof planetKindSchema>>();
  expectTypeOf<SolarSystemIdentity>().toEqualTypeOf<z.infer<typeof solarSystemIdentitySchema>>();
  expectTypeOf<SolarSystemSource>().toEqualTypeOf<z.infer<typeof solarSystemSourceSchema>>();
  expectTypeOf<ExoplanetObservation>().toEqualTypeOf<z.infer<typeof exoplanetObservationSchema>>();
  expectTypeOf<ExoplanetProfile>().toEqualTypeOf<z.infer<typeof exoplanetProfileSchema>>();
  expectTypeOf<ApiMetadata>().toEqualTypeOf<z.infer<typeof planetMetadataSchema>>();
  expectTypeOf<PlanetResponse>().toEqualTypeOf<z.infer<typeof planetResponseSchema>>();
  expectTypeOf<PlanetSearchResponse>().toEqualTypeOf<z.infer<typeof planetSearchResponseSchema>>();

  expectTypeOf<StarKind>().toEqualTypeOf<z.infer<typeof starKindSchema>>();
  expectTypeOf<StarObservation>().toEqualTypeOf<z.infer<typeof starObservationSchema>>();
  expectTypeOf<StarProfile>().toEqualTypeOf<z.infer<typeof starProfileSchema>>();
  expectTypeOf<StarApiMetadata>().toEqualTypeOf<z.infer<typeof starMetadataSchema>>();
  expectTypeOf<StarResponse>().toEqualTypeOf<z.infer<typeof starResponseSchema>>();
  expectTypeOf<StarSearchResponse>().toEqualTypeOf<z.infer<typeof starSearchResponseSchema>>();

  expectTypeOf<EphemerisVector>().toEqualTypeOf<z.infer<typeof ephemerisVectorSchema>>();
  expectTypeOf<EphemerisResponse>().toEqualTypeOf<z.infer<typeof ephemerisResponseSchema>>();
  expectTypeOf<ApiErrorResponse>().toEqualTypeOf<z.infer<typeof apiErrorResponseSchema>>();
});

test("maps response schema names to their exact inferred response types", () => {
  expectTypeOf<ApiResponse<"ApiError">>().toEqualTypeOf<ApiErrorResponse>();
  expectTypeOf<ApiResponse<"Ephemeris">>().toEqualTypeOf<EphemerisResponse>();
  expectTypeOf<ApiResponse<"Planet">>().toEqualTypeOf<PlanetResponse>();
  expectTypeOf<ApiResponse<"PlanetSearch">>().toEqualTypeOf<PlanetSearchResponse>();
  expectTypeOf<ApiResponse<"Star">>().toEqualTypeOf<StarResponse>();
  expectTypeOf<ApiResponse<"StarSearch">>().toEqualTypeOf<StarSearchResponse>();

  expect(apiResponseSchemas).toEqual({
    ApiError: apiErrorResponseSchema,
    Ephemeris: ephemerisResponseSchema,
    Planet: planetResponseSchema,
    PlanetSearch: planetSearchResponseSchema,
    Star: starResponseSchema,
    StarSearch: starSearchResponseSchema,
  });
});
