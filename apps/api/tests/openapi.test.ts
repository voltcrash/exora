import { apiErrorResponseSchema } from "@exora/contracts";
import { expect, test, vi } from "vite-plus/test";
import { createApp } from "../src/app.ts";
import { NasaArchiveError, type PlanetRepository } from "../src/nasa-archive.ts";
import { openApiDocument } from "../src/openapi.ts";
import { createRateLimiter } from "../src/rate-limit.ts";

const documentedStatuses = {
  "/api/ephemerides": [200, 400, 429, 500, 502],
  "/api/health": [200, 429, 500],
  "/api/openapi.json": [200, 429, 500],
  "/api/planets": [200, 400, 429, 500, 502],
  "/api/planets/featured": [200, 404, 429, 500, 502],
  "/api/planets/{name}": [200, 400, 404, 429, 500, 502],
  "/api/stars": [200, 400, 429, 500, 502],
  "/api/stars/featured": [200, 429, 500, 502],
  "/api/stars/{name}": [200, 400, 404, 429, 500, 502],
  "/api/stars/{name}/planets": [200, 400, 404, 429, 500, 502],
} as const satisfies Record<keyof typeof openApiDocument.paths, readonly number[]>;

const errorResponseNames = {
  400: "BadRequest",
  404: "NotFound",
  429: "RateLimited",
  500: "InternalServerError",
  502: "UpstreamUnavailable",
} as const;

const repositoryWith = ({
  findByName = async () => ({ cached: false, value: null }),
  search = async () => ({ cached: false, value: [] }),
}: Partial<Pick<PlanetRepository, "findByName" | "search">> = {}): PlanetRepository => ({
  browse: async () => ({ cached: false, value: [] }),
  discover: async () => ({ cached: false, value: [] }),
  findByHost: async () => ({ cached: false, value: [] }),
  findByName,
  search,
});

test("documents the exact error statuses each public route can return", () => {
  for (const [path, statuses] of Object.entries(documentedStatuses)) {
    const operation = openApiDocument.paths[path as keyof typeof openApiDocument.paths].get;
    expect(
      Object.keys(operation.responses)
        .map(Number)
        .toSorted((left, right) => left - right),
    ).toEqual(statuses);

    for (const status of statuses.filter((candidate) => candidate >= 400)) {
      const responseName = errorResponseNames[status as keyof typeof errorResponseNames];
      expect(operation.responses).toHaveProperty(String(status), {
        $ref: `#/components/responses/${responseName}`,
      });
    }
  }
});

test("every reusable OpenAPI error response uses the runtime ApiError schema", () => {
  for (const response of Object.values(openApiDocument.components.responses)) {
    expect(response.description).not.toHaveLength(0);
    expect(response.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/ApiError",
    });
  }
});

test("important runtime failure paths remain represented in OpenAPI", async () => {
  const rateLimitedApp = createApp({
    rateLimiter: createRateLimiter({ limit: 1, windowMs: 60_000 }),
    repository: repositoryWith(),
  });
  await rateLimitedApp.request("/api/health");

  const cases = [
    {
      documentedPath: "/api/planets" as const,
      expectedStatus: 400,
      request: () => createApp({ repository: repositoryWith() }).request("/api/planets"),
    },
    {
      documentedPath: "/api/planets/{name}" as const,
      expectedStatus: 404,
      request: () =>
        createApp({ repository: repositoryWith() }).request("/api/planets/Unknown%20b"),
    },
    {
      documentedPath: "/api/health" as const,
      expectedStatus: 429,
      request: () => rateLimitedApp.request("/api/health"),
    },
    {
      documentedPath: "/api/planets" as const,
      expectedStatus: 500,
      request: () =>
        createApp({
          repository: repositoryWith({
            search: async () => {
              throw new Error("unexpected failure");
            },
          }),
        }).request("/api/planets?q=earth"),
    },
    {
      documentedPath: "/api/planets" as const,
      expectedStatus: 502,
      request: () =>
        createApp({
          repository: repositoryWith({
            search: async () => {
              throw new NasaArchiveError("archive failure");
            },
          }),
        }).request("/api/planets?q=earth"),
    },
  ];
  const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

  try {
    for (const failure of cases) {
      const response = await failure.request();
      expect(response.status).toBe(failure.expectedStatus);
      expect(apiErrorResponseSchema.safeParse(await response.json()).success).toBe(true);
      expect(
        Object.keys(openApiDocument.paths[failure.documentedPath].get.responses).map(Number),
      ).toContain(response.status);
    }
  } finally {
    logged.mockRestore();
  }
});
