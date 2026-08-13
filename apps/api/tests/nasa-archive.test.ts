import { expect, test } from "vite-plus/test";
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
  disc_year: 2017,
  discoverymethod: "Imaging",
  st_spectype: "A2 V",
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
    },
  });
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
