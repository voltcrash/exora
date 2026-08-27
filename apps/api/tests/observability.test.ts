import { expect, test } from "vite-plus/test";
import { createApp } from "../src/app.ts";
import { DatabaseError } from "../src/errors.ts";
import { NasaArchiveError, type PlanetRepository } from "../src/nasa-archive.ts";
import { ApiObservability, type StructuredLogRecord } from "../src/observability.ts";
import type { SbdbRepository } from "../src/sbdb.ts";

const emptyRepository: PlanetRepository = {
  browse: async () => ({ cached: false, value: [] }),
  discover: async () => ({ cached: false, value: [] }),
  findByHost: async () => ({ cached: false, value: [] }),
  findByName: async () => ({ cached: false, value: null }),
  search: async () => ({ cached: false, value: [] }),
};

const collect = (requestId = "generated-request-id") => {
  const records: StructuredLogRecord[] = [];
  return {
    observability: new ApiObservability({
      log: (record) => records.push(record),
      randomUUID: () => requestId,
    }),
    records,
  };
};

test("preserves a safe caller correlation ID across the response and dependency logs", async () => {
  const telemetry = collect();
  const response = await createApp({
    observability: telemetry.observability,
    repository: emptyRepository,
  }).request("/api/planets?q=do-not-log-this", {
    headers: { "x-request-id": "edge-01HZY3FQ" },
  });

  expect(response.headers.get("X-Request-ID")).toBe("edge-01HZY3FQ");
  expect(telemetry.records).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        dependency: "nasa",
        event: "dependency.completed",
        request_id: "edge-01HZY3FQ",
      }),
      expect.objectContaining({
        event: "request.completed",
        request_id: "edge-01HZY3FQ",
        route: "/api/planets",
        status: 200,
      }),
    ]),
  );
  expect(JSON.stringify(telemetry.records)).not.toContain("do-not-log-this");
});

test("replaces an unsafe correlation ID instead of reflecting it", async () => {
  const telemetry = collect("safe-generated-id");
  const response = await createApp({
    observability: telemetry.observability,
    repository: emptyRepository,
  }).request("/api/health", {
    headers: { "x-request-id": "unsafe id with spaces" },
  });

  expect(response.headers.get("X-Request-ID")).toBe("safe-generated-id");
  expect(telemetry.records.at(-1)).toMatchObject({ request_id: "safe-generated-id" });
});

test("classifies validation, upstream, database, and internal failures", async () => {
  const scenarios = [
    {
      expected: "validation",
      path: "/api/planets",
      repository: emptyRepository,
      source: "nasa" as const,
    },
    {
      expected: "upstream",
      path: "/api/planets?q=test",
      repository: {
        ...emptyRepository,
        search: async () => {
          throw new NasaArchiveError("upstream details that must not be logged");
        },
      },
      source: "nasa" as const,
    },
    {
      expected: "database",
      path: "/api/planets?q=test",
      repository: {
        ...emptyRepository,
        search: async () => {
          throw new DatabaseError("postgres://user:secret@database/catalog");
        },
      },
      source: "database" as const,
    },
    {
      expected: "internal",
      path: "/api/planets?q=test",
      repository: {
        ...emptyRepository,
        search: async () => {
          throw new Error("unexpected secret-bearing detail");
        },
      },
      source: "nasa" as const,
    },
  ];

  for (const scenario of scenarios) {
    const telemetry = collect();
    await createApp({
      observability: telemetry.observability,
      planetDataSource: scenario.source,
      repository: scenario.repository,
    }).request(scenario.path);

    expect(telemetry.records.at(-1)).toMatchObject({
      error_type: scenario.expected,
      event: "request.completed",
    });
    expect(JSON.stringify(telemetry.records)).not.toMatch(
      /postgres:|secret-bearing|upstream details/,
    );
  }
});

test("records stale upstream recovery separately from ordinary cache hits", async () => {
  const telemetry = collect();
  const staleSbdb: SbdbRepository = {
    search: async () => ({
      cached: true,
      data: null,
      matches: [],
      retrievedAt: "2026-08-27T00:00:00.000Z",
      stale: true,
      status: "not-found",
    }),
  };

  await createApp({
    observability: telemetry.observability,
    repository: emptyRepository,
    sbdbRepository: staleSbdb,
  }).request("/api/small-bodies?q=Eros");

  expect(telemetry.records).toContainEqual(
    expect.objectContaining({
      cache: "stale_fallback",
      dependency: "jpl",
      event: "dependency.completed",
      operation: "sbdb.search",
    }),
  );
});
