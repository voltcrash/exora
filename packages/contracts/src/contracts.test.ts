import { expect, expectTypeOf, test } from "vite-plus/test";
import type { z } from "zod";
import {
  apiErrorResponseSchema,
  apiResponseSchemas,
  ephemerisResponseSchema,
  ephemerisVectorSchema,
  exoplanetObservationSchema,
  exoplanetProfileSchema,
  missionTrajectoryPointSchema,
  missionTrajectoryResponseSchema,
  planetKindSchema,
  planetMetadataSchema,
  planetResponseSchema,
  planetSearchResponseSchema,
  smallBodyCloseApproachSchema,
  smallBodyKindSchema,
  smallBodyLookupSchema,
  smallBodyMatchSchema,
  smallBodyParameterSchema,
  smallBodyProfileSchema,
  smallBodySearchResponseSchema,
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
  type MissionTrajectoryPoint,
  type MissionTrajectoryResponse,
  type PlanetKind,
  type PlanetResponse,
  type PlanetSearchResponse,
  type SmallBodyCloseApproach,
  type SmallBodyKind,
  type SmallBodyLookup,
  type SmallBodyMatch,
  type SmallBodyParameter,
  type SmallBodyProfile,
  type SmallBodySearchResponse,
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
  expectTypeOf<MissionTrajectoryPoint>().toEqualTypeOf<
    z.infer<typeof missionTrajectoryPointSchema>
  >();
  expectTypeOf<MissionTrajectoryResponse>().toEqualTypeOf<
    z.infer<typeof missionTrajectoryResponseSchema>
  >();

  expectTypeOf<SmallBodyKind>().toEqualTypeOf<z.infer<typeof smallBodyKindSchema>>();
  expectTypeOf<SmallBodyLookup>().toEqualTypeOf<z.infer<typeof smallBodyLookupSchema>>();
  expectTypeOf<SmallBodyParameter>().toEqualTypeOf<z.infer<typeof smallBodyParameterSchema>>();
  expectTypeOf<SmallBodyCloseApproach>().toEqualTypeOf<
    z.infer<typeof smallBodyCloseApproachSchema>
  >();
  expectTypeOf<SmallBodyProfile>().toEqualTypeOf<z.infer<typeof smallBodyProfileSchema>>();
  expectTypeOf<SmallBodyMatch>().toEqualTypeOf<z.infer<typeof smallBodyMatchSchema>>();
  expectTypeOf<SmallBodySearchResponse>().toEqualTypeOf<
    z.infer<typeof smallBodySearchResponseSchema>
  >();
  expectTypeOf<ApiErrorResponse>().toEqualTypeOf<z.infer<typeof apiErrorResponseSchema>>();
});

test("maps response schema names to their exact inferred response types", () => {
  expectTypeOf<ApiResponse<"ApiError">>().toEqualTypeOf<ApiErrorResponse>();
  expectTypeOf<ApiResponse<"Ephemeris">>().toEqualTypeOf<EphemerisResponse>();
  expectTypeOf<ApiResponse<"MissionTrajectory">>().toEqualTypeOf<MissionTrajectoryResponse>();
  expectTypeOf<ApiResponse<"Planet">>().toEqualTypeOf<PlanetResponse>();
  expectTypeOf<ApiResponse<"PlanetSearch">>().toEqualTypeOf<PlanetSearchResponse>();
  expectTypeOf<ApiResponse<"SmallBodySearch">>().toEqualTypeOf<SmallBodySearchResponse>();
  expectTypeOf<ApiResponse<"Star">>().toEqualTypeOf<StarResponse>();
  expectTypeOf<ApiResponse<"StarSearch">>().toEqualTypeOf<StarSearchResponse>();

  expect(apiResponseSchemas).toEqual({
    ApiError: apiErrorResponseSchema,
    Ephemeris: ephemerisResponseSchema,
    MissionTrajectory: missionTrajectoryResponseSchema,
    Planet: planetResponseSchema,
    PlanetSearch: planetSearchResponseSchema,
    SmallBodySearch: smallBodySearchResponseSchema,
    Star: starResponseSchema,
    StarSearch: starSearchResponseSchema,
  });
});
