import { apiResponseSchemas } from "@exora/contracts";
import { z } from "zod";

const response = (schema: keyof typeof apiResponseSchemas, description: string) => ({
  content: {
    "application/json": {
      schema: { $ref: `#/components/schemas/${schema}` },
    },
  },
  description,
});

const errorResponses = {
  400: response("ApiError", "Invalid request"),
  404: response("ApiError", "Resource not found"),
  429: response("ApiError", "Rate limit exceeded"),
  502: response("ApiError", "Upstream astronomy service unavailable"),
};

const queryParameter = (name: string, description: string, schema: Record<string, unknown>) => ({
  description,
  in: "query",
  name,
  schema,
});

export const openApiDocument = {
  components: {
    schemas: Object.fromEntries(
      Object.entries(apiResponseSchemas).map(([name, schema]) => [name, z.toJSONSchema(schema)]),
    ),
  },
  info: {
    description:
      "Runtime-validated astronomy data from NASA Exoplanet Archive, SIMBAD, NASA/JPL Horizons, SBDB, and Exora's synchronized catalog.",
    title: "Exora API",
    version: "1.0.0",
  },
  openapi: "3.1.0",
  paths: {
    "/api/ephemerides": {
      get: {
        parameters: [
          queryParameter("at", "ISO timestamp from 1900 through 2100", {
            format: "date-time",
            type: "string",
          }),
          queryParameter("ids", "Comma-separated allowlisted NAIF IDs", { type: "string" }),
        ],
        responses: {
          200: response("Ephemeris", "Heliocentric ecliptic-J2000 vectors"),
          ...errorResponses,
        },
        summary: "Get Solar System ephemerides",
      },
    },
    "/api/health": {
      get: {
        responses: {
          200: {
            content: {
              "application/json": {
                schema: {
                  additionalProperties: false,
                  properties: {
                    service: { const: "exora-api", type: "string" },
                    status: { const: "ok", type: "string" },
                  },
                  required: ["service", "status"],
                  type: "object",
                },
              },
            },
            description: "Service is available",
          },
          429: errorResponses[429],
        },
        summary: "Check API health",
      },
    },
    "/api/mission-trajectories": {
      get: {
        parameters: [
          queryParameter("spk", "Allowlisted spacecraft SPK ID", { type: "string" }),
          queryParameter("start", "UTC start date", { format: "date", type: "string" }),
          queryParameter("stop", "UTC stop date", { format: "date", type: "string" }),
          queryParameter("step", "Sampling interval in days", {
            maximum: 365,
            minimum: 1,
            type: "integer",
          }),
        ],
        responses: {
          200: response("MissionTrajectory", "Validated spacecraft trajectory samples"),
          ...errorResponses,
        },
        summary: "Get a mission trajectory",
      },
    },
    "/api/openapi.json": {
      get: {
        responses: { 200: { description: "OpenAPI 3.1 document" }, 429: errorResponses[429] },
        summary: "Get this OpenAPI document",
      },
    },
    "/api/planets": {
      get: {
        parameters: [
          queryParameter("q", "Planet-name search", { type: "string" }),
          queryParameter("host", "Exact host-star name", { type: "string" }),
          queryParameter("category", "Curated discovery category", { type: "string" }),
          queryParameter("browse", "Named browse collection", { type: "string" }),
          queryParameter("limit", "Bounded result count", { type: "integer" }),
        ],
        responses: { 200: response("PlanetSearch", "Matching planet profiles"), ...errorResponses },
        summary: "Search or discover planets",
      },
    },
    "/api/planets/featured": {
      get: {
        responses: { 200: response("Planet", "Featured planet profile"), ...errorResponses },
        summary: "Get the featured planet",
      },
    },
    "/api/planets/{name}": {
      get: {
        parameters: [
          { in: "path", name: "name", required: true, schema: { maxLength: 100, type: "string" } },
        ],
        responses: { 200: response("Planet", "Exact planet profile"), ...errorResponses },
        summary: "Get a planet by archive name",
      },
    },
    "/api/small-bodies": {
      get: {
        parameters: [
          queryParameter("q", "Name, designation, or SPK identifier", {
            maxLength: 100,
            minLength: 1,
            type: "string",
          }),
          queryParameter("lookup", "Lookup interpretation", {
            enum: ["auto", "designation", "spk"],
            type: "string",
          }),
        ],
        responses: {
          200: response("SmallBodySearch", "Unique, ambiguous, or not-found SBDB result"),
          ...errorResponses,
        },
        summary: "Search JPL small bodies",
      },
    },
    "/api/stars": {
      get: {
        parameters: [
          queryParameter("q", "SIMBAD object-name search", { type: "string" }),
          queryParameter("category", "Curated discovery category", { type: "string" }),
          queryParameter("limit", "Bounded result count", { type: "integer" }),
        ],
        responses: { 200: response("StarSearch", "Matching star profiles"), ...errorResponses },
        summary: "Search or discover stars",
      },
    },
    "/api/stars/featured": {
      get: {
        responses: { 200: response("StarSearch", "Featured stars"), ...errorResponses },
        summary: "Get featured stars",
      },
    },
    "/api/stars/{name}": {
      get: {
        parameters: [
          { in: "path", name: "name", required: true, schema: { maxLength: 100, type: "string" } },
        ],
        responses: { 200: response("Star", "Exact star profile"), ...errorResponses },
        summary: "Get a star by SIMBAD name",
      },
    },
    "/api/stars/{name}/planets": {
      get: {
        parameters: [
          { in: "path", name: "name", required: true, schema: { maxLength: 100, type: "string" } },
          queryParameter("limit", "Bounded planet count", { type: "integer" }),
        ],
        responses: {
          200: response("PlanetSearch", "Planets around the resolved SIMBAD host"),
          ...errorResponses,
        },
        summary: "Get planets around a star",
      },
    },
  },
} as const;
