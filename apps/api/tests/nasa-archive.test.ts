import { expect, test } from "vite-plus/test";
import { DEFAULT_MAX_ENTRIES } from "../src/archive-cache.ts";
import {
  NasaArchiveError,
  NasaPlanetRepository,
  type NasaPlanetRepositoryOptions,
  normalizeNasaPlanet,
  planetNamePattern,
  planetNamePrefixes,
  rankPlanetMatches,
} from "../src/nasa-archive.ts";

type Fetcher = NonNullable<NasaPlanetRepositoryOptions["fetcher"]>;
const liveQueriesOnly =
  (fetcher: Fetcher): Fetcher =>
  async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    return url.searchParams.get("query")?.startsWith("select top ")
      ? fetcher(input, init)
      : new Response(null, { status: 503 });
  };

const nasaRow = {
  pl_name: "HIP 65426 b",
  hostname: "HIP 65426",
  pl_radj: 1.5,
  pl_bmassj: 9,
  pl_rade: 16.8,
  pl_bmasse: 2860.4,
  pl_bmassprov: "Mass",
  pl_rade_reflink:
    "<a refstr=CHAUVIN_ET_AL__2017 href=https://ui.adsabs.harvard.edu/abs/2017A&A...605L...9C/abstract target=ref>Chauvin et al. 2017</a>",
  pl_eqt: 1500,
  pl_orbper: null,
  pl_orbsmax: 92,
  pl_orbeccen: 0.06,
  pl_orbincl: 88.4,
  sy_dist: 108.875,
  ra: 201.1501727,
  dec: -51.5045384,
  disc_year: 2017,
  discoverymethod: "Imaging",
  st_spectype: "A2 V",
  st_teff: 8840,
  st_rad: 1.77,
  st_mass: 1.96,
  st_lum: 1.02,
};

test("normalizes NASA columns into the Exora contract", () => {
  const planet = normalizeNasaPlanet(nasaRow, "2026-08-13");

  expect(planet).toMatchObject({
    id: "hip-65426-b",
    kind: "gas-giant",
    name: "HIP 65426 b",
    observation: {
      equilibriumTemperatureKelvin: 1500,
      massJupiter: 9,
      massProvenance: "measured",
      radiusJupiter: 1.5,
      radiusProvenance: "measured",
      orbitalEccentricity: 0.06,
      orbitalInclinationDegrees: 88.4,
      hostTemperatureKelvin: 8840,
      hostRadiusSolar: 1.77,
      hostMassSolar: 1.96,
      hostLuminosityLogSolar: 1.02,
      distanceParsecs: 108.875,
      rightAscensionDegrees: 201.1501727,
      declinationDegrees: -51.5045384,
    },
  });
});

test("a radial-velocity row keeps its minimum mass and calculated radius apart from measurements", () => {
  const planet = normalizeNasaPlanet({
    ...nasaRow,
    pl_bmassprov: "Msini",
    pl_rade_reflink:
      "<a refstr=CALCULATED_VALUE href=/docs/pscp_calc.html target=_blank>Calculated Value</a>",
  });

  expect(planet?.observation).toMatchObject({
    massProvenance: "minimum",
    radiusProvenance: "estimated",
  });
});

test("a mass read off the archive's mass-radius relation is marked as an estimate", () => {
  const planet = normalizeNasaPlanet({ ...nasaRow, pl_bmassprov: "M-R relationship" });

  expect(planet?.observation.massProvenance).toBe("estimated");
});

test("provenance is unknown rather than assumed when the value itself is missing", () => {
  const planet = normalizeNasaPlanet({
    ...nasaRow,
    pl_bmasse: null,
    pl_bmassj: null,
    pl_rade: null,
    pl_radj: null,
  });

  expect(planet?.observation).toMatchObject({ massProvenance: null, radiusProvenance: null });
});

test("a row with no solved orbit shape reports none rather than a circle in a shared plane", () => {
  const planet = normalizeNasaPlanet({ ...nasaRow, pl_orbeccen: null, pl_orbincl: null });

  expect(planet?.observation).toMatchObject({
    orbitalEccentricity: null,
    orbitalInclinationDegrees: null,
  });
});

test("a row with no sky position reports none rather than a placeholder", () => {
  const planet = normalizeNasaPlanet({ ...nasaRow, ra: null, dec: null, sy_dist: null });

  expect(planet?.observation).toMatchObject({
    declinationDegrees: null,
    distanceParsecs: null,
    rightAscensionDegrees: null,
  });
});

test("a transiting world carries the dip and ephemeris the archive solved for", () => {
  const planet = normalizeNasaPlanet({
    ...nasaRow,
    pl_imppar: 0.507,
    pl_orbpererr1: 0.0000003,
    pl_orbpererr2: -0.0000004,
    pl_ratror: 0.12086,
    pl_rvamp: 84.7,
    pl_trandep: 1.5,
    pl_trandur: 3.072,
    pl_tranmid: 2451659.93742,
    pl_tranmiderr1: 0.00002,
    pl_tranmiderr2: -0.00002,
  });

  expect(planet?.observation.signal).toEqual({
    impactParameter: 0.507,
    orbitalPeriodUncertaintyDays: 0.0000004,
    radialVelocityAmplitudeMetersPerSecond: 84.7,
    radiusRatio: 0.12086,
    transitDepthPercent: 1.5,
    transitDurationHours: 3.072,
    transitMidpointBjd: 2451659.93742,
    transitMidpointUncertaintyDays: 0.00002,
  });
});

test("a conjunction time from a velocity fit is not reported as a transit", () => {
  const planet = normalizeNasaPlanet({
    ...nasaRow,
    pl_imppar: null,
    pl_ratror: null,
    pl_rvamp: 55.77,
    pl_trandep: null,
    pl_trandur: null,
    pl_tranmid: 2456326.9323,
    pl_tranmiderr1: 0.002,
    pl_tranmiderr2: -0.002,
  });

  expect(planet?.observation.signal).toMatchObject({
    radialVelocityAmplitudeMetersPerSecond: 55.77,
    transitDepthPercent: null,
    transitMidpointBjd: null,
    transitMidpointUncertaintyDays: null,
  });
});

test("rejects malformed NASA measurements instead of rewriting them as null", async () => {
  const repository = new NasaPlanetRepository({
    fetcher: async () => Response.json([{ ...nasaRow, pl_orbeccen: "not measured" }]),
  });

  await expect(repository.search("HIP", 12)).rejects.toBeInstanceOf(NasaArchiveError);
});

test("the TAP query asks for the sky position every destination needs", async () => {
  let query = "";
  const repository = new NasaPlanetRepository({
    fetcher: async (input) => {
      query = new URL(input as string).searchParams.get("query") ?? "";
      return Response.json([nasaRow]);
    },
  });

  await repository.findByName("HIP 65426 b");

  expect(query).toContain("ra,dec");
  expect(query).toContain("pl_orbeccen,pl_orbincl");
  expect(query).toContain("pl_trandep,pl_trandur,pl_imppar,pl_ratror,pl_rvamp,pl_tranmid");
});

test("caches identical TAP queries", async () => {
  let requests = 0;
  const repository = new NasaPlanetRepository({
    now: () => Date.parse("2026-08-13T00:00:00Z"),
    fetcher: liveQueriesOnly(async () => {
      requests += 1;
      return Response.json([nasaRow]);
    }),
  });

  const first = await repository.findByName("HIP 65426 b");
  const second = await repository.findByName("HIP 65426 b");

  expect(first.cached).toBe(false);
  expect(second.cached).toBe(true);
  expect(second.value?.name).toBe("HIP 65426 b");
  expect(requests).toBe(1);
});

test("coalesces identical TAP queries while the first request is unresolved", async () => {
  let requests = 0;
  let release!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const repository = new NasaPlanetRepository({
    fetcher: liveQueriesOnly(() => {
      requests += 1;
      return response;
    }),
  });

  const first = repository.findByName("HIP 65426 b");
  const second = repository.findByName("HIP 65426 b");
  await Promise.resolve();
  expect(requests).toBe(1);

  release(Response.json([nasaRow]));
  const [firstResult, secondResult] = await Promise.all([first, second]);
  expect(firstResult.value?.name).toBe("HIP 65426 b");
  expect(secondResult.value?.name).toBe("HIP 65426 b");
  expect(requests).toBe(1);
});

test("queries confirmed worlds by their exact host system", async () => {
  let requestedUrl = "";
  const repository = new NasaPlanetRepository({
    fetcher: async (input) => {
      requestedUrl =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return Response.json([nasaRow]);
    },
  });

  const result = await repository.findByHost("HIP 65426", 50);
  const query = new URL(requestedUrl).searchParams.get("query");

  expect(result.value).toHaveLength(1);
  expect(query).toContain("top 24");
  expect(query).toContain("lower(hostname)=lower('HIP 65426')");
});

test("bounds the physical-control browsing field", async () => {
  let requestedUrl = "";
  const repository = new NasaPlanetRepository({
    fetcher: liveQueriesOnly(async (input) => {
      requestedUrl =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return Response.json([nasaRow]);
    }),
  });

  const result = await repository.browse(500);
  const query = new URL(requestedUrl).searchParams.get("query");

  expect(result.value).toHaveLength(1);
  expect(result.nextCursor).toBeNull();
  expect(query).toContain("top 120");
  expect(query).toContain("sy_dist is not null");
});

test("pages the browsing field with a keyset cursor", async () => {
  let requestedUrl = "";
  const repository = new NasaPlanetRepository({
    fetcher: liveQueriesOnly(async (input) => {
      requestedUrl =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return Response.json(Array.from({ length: 12 }, () => nasaRow));
    }),
  });

  const result = await repository.browse(12, "Kepler-11 b");
  const query = new URL(requestedUrl).searchParams.get("query");

  expect(query).toContain("pl_name > 'Kepler-11 b'");
  expect(result.nextCursor).toBe(result.value.at(-1)?.name);
});

test("resolves a planet by name whatever casing the caller used", async () => {
  const requestedQueries: string[] = [];
  const repository = new NasaPlanetRepository({
    fetcher: liveQueriesOnly(async (input) => {
      const href =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      requestedQueries.push(new URL(href).searchParams.get("query") ?? "");
      return Response.json([nasaRow]);
    }),
  });

  const exact = await repository.findByName("HIP 65426 b");
  const lowercased = await repository.findByName("hip 65426 b");

  expect(exact.value?.name).toBe("HIP 65426 b");
  expect(lowercased.value?.name).toBe("HIP 65426 b");
  for (const query of requestedQueries) {
    expect(query).toContain("lower(pl_name)=lower(");
  }
});

test("the query cache is bounded, so arbitrary searches cannot grow it without limit", async () => {
  let requests = 0;
  const repository = new NasaPlanetRepository({
    now: () => 0,
    fetcher: liveQueriesOnly(async () => {
      requests += 1;
      return Response.json([nasaRow]);
    }),
  });

  await repository.findByName("first");
  await repository.findByName("first");
  expect(requests).toBe(1);

  for (let index = 0; index < DEFAULT_MAX_ENTRIES; index += 1) {
    await repository.findByName(`flood-${index}`);
  }

  const beforeResident = requests;
  await repository.findByName(`flood-${DEFAULT_MAX_ENTRIES - 1}`);
  expect(requests).toBe(beforeResident);

  const beforeEvicted = requests;
  await repository.findByName("first");
  expect(requests).toBe(beforeEvicted + 1);
});

test("planet search ignores the separators people type between a name's parts", () => {
  expect(planetNamePattern("kepler 18")).toBe("%kepler%18%");
  expect(planetNamePattern("Kepler18")).toBe("%kepler%18%");
  expect(planetNamePattern("TRAPPIST-1e")).toBe("%trappist%1%e%");
  expect(planetNamePattern("51 Peg b")).toBe("%51%peg%b%");
  expect(planetNamePattern("o'neil_%")).toBe("%o%neil%");
  expect(planetNamePattern(" -- ")).toBeNull();
});

test("a search with nothing searchable in it never reaches the archive", async () => {
  let requests = 0;
  const repository = new NasaPlanetRepository({
    fetcher: async () => {
      requests += 1;
      return Response.json([nasaRow]);
    },
  });

  expect(await repository.search("--", 12)).toEqual({ cached: true, value: [] });
  expect(requests).toBe(0);
});

test("whole names are tried with a hyphen, a space and nothing between the parts", () => {
  expect(planetNamePrefixes("kepler 18")).toEqual([
    "kepler-18",
    "kepler-18 %",
    "kepler 18",
    "kepler 18 %",
    "kepler18",
    "kepler18 %",
  ]);
  expect(planetNamePrefixes("wasp")).toEqual(["wasp", "wasp %"]);
});

test("the planet a reader means outranks longer names that merely contain it", () => {
  const named = (name: string) => normalizeNasaPlanet({ ...nasaRow, pl_name: name })!;
  const ranked = rankPlanetMatches(
    "kepler 18",
    ["Kepler-1018 b", "Kepler-187 b", "Kepler-18 c", "Kepler-18 b"].map(named),
  ).map(({ name }) => name);

  expect(ranked).toEqual(["Kepler-18 b", "Kepler-18 c", "Kepler-187 b", "Kepler-1018 b"]);
});

test("exact-name lookups share a complete snapshot and missing names remain null", async () => {
  const queries: string[] = [];
  const repository = new NasaPlanetRepository({
    fetcher: async (input) => {
      queries.push(
        new URL(input instanceof Request ? input.url : input).searchParams.get("query")!,
      );
      return Response.json([nasaRow, { ...nasaRow, pl_name: "Kepler-18 b" }]);
    },
  });
  await repository.findByName(nasaRow.pl_name);
  expect((await repository.findByName("kepler-18 B")).value?.name).toBe("Kepler-18 b");
  expect(await repository.findByName("unknown")).toEqual({ cached: true, value: null });
  expect((await repository.findByName("HIP 65426 b")).cached).toBe(true);
  expect(queries).toHaveLength(2);
  expect(queries[0]).toMatch(/^select pl_name,hostname,/);
  expect(queries[0]).toContain("from pscomppars order by pl_name");
  expect(queries[0]).not.toContain("where");
});

test("snapshot searches match separated name parts and retain exact-name ranking", async () => {
  const names = [
    "Kepler-1018 b",
    "Kepler-187 b",
    "Kepler-18 c",
    "Kepler-18 b",
    "TRAPPIST-1 e",
    "51 Peg b",
    "O'Neil-1 b",
  ];
  let requests = 0;
  const repository = new NasaPlanetRepository({
    fetcher: async () => {
      requests += 1;
      return Response.json(names.map((pl_name) => ({ ...nasaRow, pl_name })));
    },
  });
  await repository.findByName(nasaRow.pl_name);
  for (const query of ["kepler 18", "Kepler18", "kepler-18"]) {
    const result = await repository.search(query, 24);
    expect(result.value.map(({ name }) => name)).toEqual([
      "Kepler-18 b",
      "Kepler-18 c",
      "Kepler-187 b",
      "Kepler-1018 b",
    ]);
  }
  expect((await repository.search("trappist1e", 12)).value[0]?.name).toBe("TRAPPIST-1 e");
  expect((await repository.search("51_peg%b", 12)).value[0]?.name).toBe("51 Peg b");
  expect((await repository.search("o'neil_%", 12)).value[0]?.name).toBe("O'Neil-1 b");
  expect((await repository.search("Kepler18", 2)).value).toHaveLength(2);
  expect(await repository.search("unknown", 12)).toEqual({ cached: true, value: [] });
  expect(requests).toBe(2);
});

test("failed snapshot searches retain the two live queries and their cache", async () => {
  let requests = 0;
  const queries: string[] = [];
  const repository = new NasaPlanetRepository({
    fetcher: liveQueriesOnly(async (input) => {
      requests += 1;
      queries.push(
        new URL(input instanceof Request ? input.url : input).searchParams.get("query")!,
      );
      return Response.json([nasaRow]);
    }),
  });
  expect((await repository.search("HIP", 12)).value[0]?.name).toBe(nasaRow.pl_name);
  expect((await repository.search("HIP", 12)).cached).toBe(true);
  expect(requests).toBe(2);
  expect(queries[0]).toContain("lower(pl_name) like 'hip'");
  expect(queries[1]).toContain("lower(pl_name) like '%hip%'");
});

test("snapshot browsing preserves bounds, null filters, order and keyset cursors", async () => {
  let requests = 0;
  const rows = Array.from({ length: 130 }, (_, index) => ({
    ...nasaRow,
    pl_name: `World ${String(index).padStart(3, "0")} b`,
  }));
  const repository = new NasaPlanetRepository({
    fetcher: async () => {
      requests += 1;
      return Response.json([
        ...rows.toReversed(),
        { ...nasaRow, pl_name: "A missing distance", sy_dist: null },
        { ...nasaRow, pl_name: "B missing temperature", pl_eqt: null },
        { ...nasaRow, pl_name: "C missing radii", pl_rade: null, pl_radj: null },
      ]);
    },
  });
  await repository.findByName(nasaRow.pl_name);
  const first = await repository.browse(500);
  expect(first.cached).toBe(true);
  expect(first.value.map(({ name }) => name)).toEqual(
    rows.slice(0, 120).map(({ pl_name }) => pl_name),
  );
  expect(first.nextCursor).toBe("World 119 b");
  const last = await repository.browse(12, first.nextCursor!);
  expect(last.value.map(({ name }) => name)).toEqual(rows.slice(120).map(({ pl_name }) => pl_name));
  expect(last.nextCursor).toBeNull();
  expect(last.cached).toBe(true);
  const minimum = await repository.browse(1);
  expect(minimum.value).toHaveLength(12);
  expect(minimum.nextCursor).toBe("World 011 b");
  expect((await repository.findByName("C missing radii")).value?.observation).toMatchObject({
    radiusEarth: null,
    radiusJupiter: null,
  });
  expect((await repository.search("World119", 12)).value[0]?.name).toBe("World 119 b");
  expect(requests).toBe(2);
});

test("cold search, browse and lookup answer live while sharing one background catalog load", async () => {
  let snapshots = 0;
  let live = 0;
  let release!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const repository = new NasaPlanetRepository({
    fetcher: async (input) => {
      const query = new URL(input instanceof Request ? input.url : input).searchParams.get(
        "query",
      )!;
      if (!query.startsWith("select top ")) {
        snapshots += 1;
        return response;
      }
      live += 1;
      return Response.json([nasaRow]);
    },
  });
  const results = await Promise.all([
    repository.search("HIP65426", 12),
    repository.browse(12),
    repository.findByName(nasaRow.pl_name),
  ]);
  expect(results.every(({ cached }) => !cached)).toBe(true);
  expect(results[0].value[0]?.name).toBe(nasaRow.pl_name);
  expect(results[1].value[0]?.name).toBe(nasaRow.pl_name);
  expect(results[2].value?.name).toBe(nasaRow.pl_name);
  expect(snapshots).toBe(1);
  expect(live).toBe(4);
  release(Response.json([nasaRow, { ...nasaRow, pl_name: "Kepler-18 b" }]));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(await repository.findByName("Kepler-18 b")).toMatchObject({
    cached: true,
    value: { name: "Kepler-18 b" },
  });
  expect((await repository.search("Kepler18", 12)).value[0]?.name).toBe("Kepler-18 b");
  expect((await repository.browse(12)).value).toHaveLength(2);
  expect(snapshots).toBe(1);
  expect(live).toBe(4);
});

test.each(["http", "json", "schema", "network", "timeout"])(
  "a %s snapshot failure falls back for every reader and recovers after cooldown",
  async (failure) => {
    let now = 0;
    let snapshots = 0;
    let live = 0;
    const repository = new NasaPlanetRepository({
      now: () => now,
      fetcher: async (input) => {
        const query = new URL(input instanceof Request ? input.url : input).searchParams.get(
          "query",
        )!;
        if (!query.startsWith("select top ")) {
          snapshots += 1;
          if (snapshots === 1) {
            if (failure === "http") return new Response(null, { status: 503 });
            if (failure === "json") return new Response("{invalid JSON");
            if (failure === "schema") return Response.json([{ ...nasaRow, pl_eqt: "unknown" }]);
            if (failure === "timeout") throw new DOMException("Timed out", "TimeoutError");
            throw new TypeError("offline");
          }
        } else live += 1;
        return Response.json([nasaRow]);
      },
    });
    expect((await repository.findByName(nasaRow.pl_name)).value?.name).toBe(nasaRow.pl_name);
    expect((await repository.browse(12)).value[0]?.name).toBe(nasaRow.pl_name);
    expect((await repository.search("HIP", 12)).value[0]?.name).toBe(nasaRow.pl_name);
    expect(snapshots).toBe(1);
    expect(live).toBe(4);
    expect((await repository.findByName(nasaRow.pl_name)).cached).toBe(true);
    now = 60_000;
    expect((await repository.findByName(nasaRow.pl_name)).cached).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await repository.search("65426b", 12)).cached).toBe(true);
    expect(snapshots).toBe(2);
    expect(live).toBe(4);
  },
);

test.each(["findByName", "search", "browse"] as const)(
  "%s serves stale data during refresh and after a failed refresh",
  async (method) => {
    let now = 0;
    let snapshots = 0;
    let live = 0;
    let release!: (response: Response) => void;
    const repository = new NasaPlanetRepository({
      cacheTtlMs: 100,
      now: () => now,
      fetcher: async (input) => {
        const query = new URL(input instanceof Request ? input.url : input).searchParams.get(
          "query",
        )!;
        if (query.startsWith("select top ")) {
          live += 1;
          return Response.json([nasaRow]);
        }
        snapshots += 1;
        if (snapshots === 1) return Response.json([nasaRow]);
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      },
    });
    const read = () =>
      method === "findByName"
        ? repository.findByName(nasaRow.pl_name)
        : method === "search"
          ? repository.search("HIP", 12)
          : repository.browse(12);
    await read();
    const stale = await read();
    expect(stale.cached).toBe(true);
    const initialLive = live;
    now = 100;
    expect(await read()).toEqual(stale);
    expect(await read()).toEqual(stale);
    expect(snapshots).toBe(2);
    expect(live).toBe(initialLive);
    release(new Response(null, { status: 503 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    now = 60_099;
    expect(await read()).toEqual(stale);
    expect(snapshots).toBe(2);
    now = 60_100;
    expect(await read()).toEqual(stale);
    expect(snapshots).toBe(3);
    release(Response.json([{ ...nasaRow, pl_eqt: 1234 }]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const refreshed = await read();
    expect(refreshed.cached).toBe(true);
    const planet = Array.isArray(refreshed.value) ? refreshed.value[0] : refreshed.value;
    expect(planet?.observation.equilibriumTemperatureKelvin).toBe(1234);
    expect(live).toBe(initialLive);
  },
);
