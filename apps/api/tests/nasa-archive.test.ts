import { expect, test } from "vite-plus/test";
import { DEFAULT_MAX_ENTRIES } from "../src/archive-cache.ts";
import { NasaPlanetRepository, normalizeNasaPlanet } from "../src/nasa-archive.ts";

const nasaRow = {
  pl_name: "HIP 65426 b",
  hostname: "HIP 65426",
  pl_radj: 1.5,
  pl_bmassj: 9,
  pl_rade: 16.8,
  pl_bmasse: 2860.4,
  pl_eqt: 1500,
  pl_orbper: null,
  pl_orbsmax: 92,
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
      radiusJupiter: 1.5,
      hostTemperatureKelvin: 8840,
      hostRadiusSolar: 1.77,
      hostMassSolar: 1.96,
      hostLuminosityLogSolar: 1.02,
      // With the distance, these place the system in the galaxy rather than only on the sky,
      // which is what lets the renderer draw the stars a visitor there would actually see.
      distanceParsecs: 108.875,
      rightAscensionDegrees: 201.1501727,
      declinationDegrees: -51.5045384,
    },
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
});

test("caches identical TAP queries", async () => {
  let requests = 0;
  const repository = new NasaPlanetRepository({
    now: () => Date.parse("2026-08-13T00:00:00Z"),
    fetcher: async () => {
      requests += 1;
      return Response.json([nasaRow]);
    },
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
    fetcher: () => {
      requests += 1;
      return response;
    },
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
    fetcher: async (input) => {
      requestedUrl =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return Response.json([nasaRow]);
    },
  });

  const result = await repository.browse(500);
  const query = new URL(requestedUrl).searchParams.get("query");

  expect(result.value).toHaveLength(1);
  expect(query).toContain("top 120");
  expect(query).toContain("sy_dist is not null");
});

test("loads the complete normalized catalog for synchronization", async () => {
  let requestedUrl = "";
  const repository = new NasaPlanetRepository({
    fetcher: async (input) => {
      requestedUrl =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return Response.json([nasaRow]);
    },
  });

  const result = await repository.listAll();
  const query = new URL(requestedUrl).searchParams.get("query");

  expect(result.value).toHaveLength(1);
  expect(query).toContain("from pscomppars order by pl_name");
  expect(query).not.toContain("select top");
});

test("resolves a planet by name whatever casing the caller used", async () => {
  const requestedQueries: string[] = [];
  const repository = new NasaPlanetRepository({
    fetcher: async (input) => {
      const href =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      requestedQueries.push(new URL(href).searchParams.get("query") ?? "");
      return Response.json([nasaRow]);
    },
  });

  const exact = await repository.findByName("HIP 65426 b");
  const lowercased = await repository.findByName("hip 65426 b");

  expect(exact.value?.name).toBe("HIP 65426 b");
  expect(lowercased.value?.name).toBe("HIP 65426 b");
  // The PostgreSQL repository behind the same interface matches on `lower(name) = lower($1)`,
  // so the archive fallback must not answer a shared link differently.
  for (const query of requestedQueries) {
    expect(query).toContain("lower(pl_name)=lower(");
  }
});

test("the query cache is bounded, so arbitrary searches cannot grow it without limit", async () => {
  let requests = 0;
  const repository = new NasaPlanetRepository({
    now: () => 0,
    fetcher: async () => {
      requests += 1;
      return Response.json([nasaRow]);
    },
  });

  await repository.search("first", 12);
  await repository.search("first", 12);
  expect(requests).toBe(1);

  // Every distinct search term is a distinct cache key, which is exactly how an unbounded map
  // would grow for the life of the process.
  for (let index = 0; index < DEFAULT_MAX_ENTRIES; index += 1) {
    await repository.search(`flood-${index}`, 12);
  }

  // The newest flood entry is still resident.
  const beforeResident = requests;
  await repository.search(`flood-${DEFAULT_MAX_ENTRIES - 1}`, 12);
  expect(requests).toBe(beforeResident);

  // The oldest one was evicted rather than kept forever, so it costs a fresh request.
  const beforeEvicted = requests;
  await repository.search("first", 12);
  expect(requests).toBe(beforeEvicted + 1);
});
