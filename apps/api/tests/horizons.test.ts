import { readFile } from "node:fs/promises";
import { expect, test, vi } from "vite-plus/test";
import {
  HORIZONS_TARGETS,
  HorizonsError,
  JplHorizonsRepository,
  parseHorizonsVector,
} from "../src/horizons.ts";

const fixture = JSON.parse(
  await readFile(new URL("./fixtures/horizons-earth-v1.2.json", import.meta.url), "utf8"),
) as unknown;
const earth = HORIZONS_TARGETS.find(({ naifId }) => naifId === 399);
if (!earth) throw new Error("Earth must be a supported Horizons target.");

test("parses the versioned Horizons vector fixture without changing its frame or units", () => {
  expect(parseHorizonsVector(fixture, earth, "2023-02-25T00:00:00.000Z")).toEqual({
    epoch: "2023-02-25T00:00:00.000Z",
    name: "Earth",
    naifId: 399,
    positionAu: {
      x: -0.9026747984245221,
      y: 0.4058472768982778,
      z: -0.00001632985998557919,
    },
    solution: "DE441",
    spkId: "399",
    velocityAuPerDay: {
      x: -0.007330685698046913,
      y: -0.01576267443031454,
      z: 2.20368745395407e-7,
    },
  });
});

test("rejects a changed Horizons signature before parsing its text result", () => {
  const changed = {
    ...(fixture as Record<string, unknown>),
    signature: { source: "NASA/JPL Horizons API", version: "9.0" },
  };
  expect(() => parseHorizonsVector(changed, earth, "2023-02-25T00:00:00.000Z")).toThrow(
    HorizonsError,
  );
});

test("rejects a valid vector table when Horizons resolved a different target", () => {
  expect(() =>
    parseHorizonsVector(fixture, HORIZONS_TARGETS[0], "2023-02-25T00:00:00.000Z"),
  ).toThrow(/different target/);
});

test("coalesces and caches identical server-side requests", async () => {
  const fetcher = vi.fn(async () => Response.json(fixture));
  const repository = new JplHorizonsRepository({ fetcher, now: () => 1_000 });
  const epoch = new Date("2023-02-25T00:00:00.000Z");

  const [first, concurrent] = await Promise.all([
    repository.positions([399], epoch),
    repository.positions([399], epoch),
  ]);
  const cached = await repository.positions([399], epoch);

  expect(fetcher).toHaveBeenCalledOnce();
  expect(first.value).toEqual(concurrent.value);
  expect(cached).toMatchObject({ cached: true, stale: false });
});

test("serves an expired vector as stale when Horizons is unavailable", async () => {
  let now = 1_000;
  const fetcher = vi
    .fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(Response.json(fixture))
    .mockRejectedValueOnce(new Error("maintenance"));
  const repository = new JplHorizonsRepository({
    cacheTtlMs: 10,
    fetcher,
    now: () => now,
    staleTtlMs: 1_000,
  });
  const epoch = new Date("2023-02-25T00:00:00.000Z");
  await repository.positions([399], epoch);
  now = 1_020;

  await expect(repository.positions([399], epoch)).resolves.toMatchObject({
    cached: true,
    stale: true,
    value: [{ naifId: 399 }],
  });
});

test("limits upstream concurrency while resolving a full target set", async () => {
  let active = 0;
  let peak = 0;
  const fetcher = vi.fn(async (input: string | URL | Request) => {
    active += 1;
    peak = Math.max(peak, active);
    await Promise.resolve();
    active -= 1;
    const url =
      input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
    const command = url.searchParams.get("COMMAND")?.replaceAll("'", "") ?? "";
    const target = HORIZONS_TARGETS.find(({ command: candidate }) => candidate === command);
    if (!target) throw new Error("Expected a supported target URL.");
    const targetFixture = structuredClone(fixture) as { result: string };
    targetFixture.result = targetFixture.result.replace(
      "Earth (399)",
      `${target.name} (${target.naifId})`,
    );
    return Response.json(targetFixture);
  });
  const repository = new JplHorizonsRepository({ fetcher, upstreamConcurrency: 2 });

  await repository.positions([199, 299, 399, 499], new Date("2023-02-25T00:00:00.000Z"));
  expect(peak).toBeLessThanOrEqual(2);
});
