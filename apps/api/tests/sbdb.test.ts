import { readFile } from "node:fs/promises";
import { expect, test, vi } from "vite-plus/test";
import { JplSbdbRepository, parseSbdbPayload, SbdbError } from "../src/sbdb.ts";

const loadFixture = async (name: string): Promise<unknown> =>
  JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as unknown;

const erosFixture = await loadFixture("sbdb-eros-v1.3.json");
const ambiguousFixture = await loadFixture("sbdb-wilson-ambiguous-v1.3.json");
const notFoundFixture = await loadFixture("sbdb-not-found-v1.3.json");
const retrievedAt = "2026-08-24T12:00:00.000Z";
const now = new Date(retrievedAt).getTime();

test("normalizes classification, uncertain parameters, and close approaches from SBDB 1.3", () => {
  const result = parseSbdbPayload(erosFixture, retrievedAt, now);

  expect(result).toMatchObject({
    status: "match",
    data: {
      designation: "433",
      fullName: "433 Eros (A898 PA)",
      kind: "asteroid",
      nearEarth: true,
      orbit: {
        conditionCode: "0",
        dataArcDays: 46582,
      },
      orbitClass: { code: "AMO", name: "Amor" },
      physicalParameters: [
        { name: "diameter", uncertainty: "0.06", value: "16.84" },
        { name: "extent", uncertainty: null },
        { name: "density", uncertainty: "0.03" },
      ],
      potentiallyHazardous: false,
      spkId: "20000433",
    },
  });
  expect(result.data?.orbit.elements).toHaveLength(5);
  expect(result.data?.orbit.elements).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "e", uncertainty: "9.3902E-9" }),
      expect.objectContaining({ name: "a", units: "au", value: "1.458243716760167" }),
    ]),
  );
  expect(result.data?.closeApproaches).toHaveLength(3);
  expect(result.data?.closeApproaches[1]).toMatchObject({
    calendarDate: "2025-Nov-30 02:18",
    distanceAu: 0.397647474377339,
    distanceMinimumAu: 0.397647431258304,
    distanceMaximumAu: 0.397647517496374,
  });
});

test("returns explicit ambiguity choices and a clear not-found state", () => {
  const ambiguous = parseSbdbPayload(ambiguousFixture, retrievedAt, now);
  expect(ambiguous).toMatchObject({
    data: null,
    status: "ambiguous",
  });
  expect(ambiguous.matches).toHaveLength(4);
  expect(ambiguous.matches).toEqual(
    expect.arrayContaining([
      { designation: "2465", name: "2465 Wilson (1949 PK)" },
      { designation: "1986 P1", name: "C/1986 P1 (Wilson)" },
    ]),
  );
  expect(parseSbdbPayload(notFoundFixture, retrievedAt, now)).toEqual({
    data: null,
    matches: [],
    retrievedAt,
    status: "not-found",
  });
});

test("rejects changed SBDB signatures before reading scientific fields", () => {
  const changed = {
    ...(erosFixture as Record<string, unknown>),
    signature: { source: "NASA/JPL Small-Body Database (SBDB) API", version: "9.0" },
  };
  expect(() => parseSbdbPayload(changed, retrievedAt, now)).toThrow(SbdbError);
});

test("preserves clear missing-data states instead of fabricating parameters", () => {
  const sparse = structuredClone(erosFixture) as Record<string, unknown>;
  delete sparse.phys_par;
  delete sparse.ca_data;

  const result = parseSbdbPayload(sparse, retrievedAt, now);
  expect(result.data).toMatchObject({ closeApproaches: [], physicalParameters: [] });
});

test("coalesces identical searches and caches popular objects longer", async () => {
  let current = now;
  const fetcher = vi.fn(async () => Response.json(erosFixture));
  const repository = new JplSbdbRepository({
    cacheTtlMs: 10,
    fetcher,
    now: () => current,
    popularCacheTtlMs: 100,
  });

  const [first, concurrent] = await Promise.all([
    repository.search("Eros", "auto"),
    repository.search("Eros", "auto"),
  ]);
  current += 50;
  const cached = await repository.search("Eros", "auto");

  expect(fetcher).toHaveBeenCalledOnce();
  expect(first.data).toEqual(concurrent.data);
  expect(cached).toMatchObject({ cached: true, stale: false });
});

test("uses explicit SPK and designation lookups without exposing JPL to the browser", async () => {
  const urls: URL[] = [];
  const repository = new JplSbdbRepository({
    fetcher: async (input) => {
      urls.push(
        input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url),
      );
      return Response.json(erosFixture);
    },
  });

  await repository.search("20000433", "auto");
  await repository.search("433", "designation");

  expect(urls[0]?.searchParams.get("spk")).toBe("20000433");
  expect(urls[1]?.searchParams.get("des")).toBe("433");
  expect(urls[0]?.searchParams.get("phys-par")).toBe("1");
  expect(urls[0]?.searchParams.get("ca-data")).toBe("1");
});

test("serves stale cached SBDB data during an upstream outage", async () => {
  let current = now;
  const fetcher = vi
    .fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(Response.json(erosFixture))
    .mockRejectedValueOnce(new Error("maintenance"));
  const repository = new JplSbdbRepository({
    cacheTtlMs: 10,
    fetcher,
    now: () => current,
    popularCacheTtlMs: 10,
    staleTtlMs: 1_000,
  });
  await repository.search("Eros", "auto");
  current += 20;

  await expect(repository.search("Eros", "auto")).resolves.toMatchObject({
    cached: true,
    stale: true,
    data: { spkId: "20000433" },
  });
});
