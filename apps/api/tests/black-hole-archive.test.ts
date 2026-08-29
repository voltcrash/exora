import { expect, test } from "vite-plus/test";
import { normalizeBlackCatRow, VizierBlackHoleRepository } from "../src/black-hole-archive.ts";
import { NORMALIZED_BLACKCAT_FALLBACK } from "../src/black-hole-fallback.ts";

const columns = [
  "Name",
  "f_Name",
  "Ctp",
  "RAJ2000",
  "DEJ2000",
  "Dist",
  "e_Dist",
  "M1",
  "massUpper",
  "massLower",
  "M1u",
  "l_M1",
];

const tapResponse = (
  rows: unknown[][] = [
    ["GS 2023+338", "*", "(V404 Cyg)", 306.0159, 33.8672, 2.39, 0.14, 9, 0.2, 0.6, null, " "],
  ],
): Response => Response.json({ data: rows, metadata: columns.map((name) => ({ name })) });

test("normalizes VizieR BlackCAT rows without inventing missing measurements", () => {
  const confirmed = normalizeBlackCatRow(NORMALIZED_BLACKCAT_FALLBACK[0]!, "2026-08-29");
  const candidate = normalizeBlackCatRow(NORMALIZED_BLACKCAT_FALLBACK[6]!, "2026-08-29");

  expect(confirmed).toMatchObject({ massSolar: 7.3, provenance: "observed", status: "confirmed" });
  expect(candidate).toMatchObject({ massSolar: null, provenance: "observed", status: "candidate" });
  expect(candidate.source.measurement).toContain("No reliable dynamical mass");
});

test("parses TAP metadata and joins dynamical mass measurements", async () => {
  const repository = new VizierBlackHoleRepository({ fetcher: async () => tapResponse() });
  const result = await repository.browse(50);

  expect(result).toMatchObject({ cached: false, stale: false });
  expect(result.value[0]).toMatchObject({
    massSolar: 9,
    massUncertaintySolar: 0.6,
    name: "GS 2023+338",
    observation: { companion: "V404 Cyg" },
    status: "confirmed",
  });
});

test("caches and coalesces identical catalog requests", async () => {
  let requests = 0;
  let release!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const repository = new VizierBlackHoleRepository({
    fetcher: () => {
      requests += 1;
      return pending;
    },
    now: () => 0,
  });

  const first = repository.browse(50);
  const second = repository.browse(10);
  await Promise.resolve();
  expect(requests).toBe(1);
  release(tapResponse());
  await Promise.all([first, second]);
  const cached = await repository.browse(50);
  expect(cached.cached).toBe(true);
  expect(requests).toBe(1);
});

test("uses the checked-in normalized fallback for malformed or timed-out responses", async () => {
  const malformed = new VizierBlackHoleRepository({
    fetcher: async () => Response.json({ data: [], metadata: [] }),
  });
  const timedOut = new VizierBlackHoleRepository({
    fetcher: (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      }),
    timeoutMs: 1,
  });

  const malformedResult = await malformed.browse(50);
  const timeoutResult = await timedOut.browse(50);
  expect(malformedResult).toMatchObject({ cached: true, stale: true });
  expect(timeoutResult).toMatchObject({ cached: true, stale: true });
  expect(malformedResult.value.length).toBeGreaterThan(5);
});

test("serves the last successful catalog after its fresh TTL expires", async () => {
  let now = 0;
  let fail = false;
  const repository = new VizierBlackHoleRepository({
    cacheTtlMs: 10,
    fetcher: async () => {
      if (fail) throw new Error("offline");
      return tapResponse();
    },
    now: () => now,
  });

  const live = await repository.browse(50);
  now = 11;
  fail = true;
  const stale = await repository.browse(50);
  expect(live.stale).toBe(false);
  expect(stale).toMatchObject({ cached: true, stale: true });
  expect(stale.value).toEqual(live.value);
});
