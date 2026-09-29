import { expect, test } from "vite-plus/test";
import { NasaArchiveError } from "../src/nasa-archive.ts";
import {
  compactPopulation,
  NasaPopulationRepository,
  POPULATION_FLAGS,
} from "../src/planet-population.ts";

const row = {
  disc_year: 2016,
  discoverymethod: "Transit",
  pl_bmasse: 0.692,
  pl_bmassprov: "Mass",
  pl_eqt: 249.7,
  pl_name: "TRAPPIST-1 e",
  pl_orbper: 6.099_043_39,
  pl_rade: 0.92,
  pl_rade_reflink: "<a refstr=AGOL_ET_AL__2021>Agol et al. 2021</a>",
  sy_dist: 12.429_888_8,
};

test("rows shrink to rounded tuples with the method as a shared index", () => {
  const population = compactPopulation([
    row,
    {
      ...row,
      discoverymethod: "Radial Velocity",
      pl_bmassprov: "Msini",
      pl_name: "51 Peg b",
      pl_rade_reflink: "<a refstr=CALCULATED_VALUE>Calculated Value</a>",
    },
    { ...row, pl_name: "TRAPPIST-1 f" },
  ]);

  expect(population.methods).toEqual(["Transit", "Radial Velocity"]);
  expect(population.rows[0]).toEqual([
    "TRAPPIST-1 e",
    6.099,
    0.92,
    0.692,
    249.7,
    12.43,
    2016,
    0,
    0,
  ]);
  expect(population.rows[1]?.[7]).toBe(1);
  expect(population.rows[1]?.[8]).toBe(
    POPULATION_FLAGS.massMinimum | POPULATION_FLAGS.radiusEstimated,
  );
  expect(population.rows[2]?.[7]).toBe(0);
});

test("missing and non-physical values stay null rather than zero", () => {
  const [compact] = compactPopulation([
    { ...row, pl_bmasse: null, pl_orbper: 0, pl_rade: null, sy_dist: -1 },
  ]).rows;

  expect(compact?.slice(1, 6)).toEqual([null, null, null, 249.7, null]);
  expect(compact?.[8]).toBe(0);
});

test("the whole-archive query is fetched once and then served from cache", async () => {
  let requests = 0;
  const repository = new NasaPopulationRepository({
    fetcher: async () => {
      requests += 1;
      return Response.json([row]);
    },
    now: () => Date.parse("2026-09-28T00:00:00Z"),
  });

  const first = await repository.population();
  const second = await repository.population();

  expect(requests).toBe(1);
  expect(first).toMatchObject({ cached: false, retrievedOn: "2026-09-28" });
  expect(second.cached).toBe(true);
  expect(second.value.rows).toHaveLength(1);
});

test("a malformed archive response is an upstream error", async () => {
  const repository = new NasaPopulationRepository({
    fetcher: async () => Response.json([{ ...row, pl_orbper: "six" }]),
  });

  await expect(repository.population()).rejects.toBeInstanceOf(NasaArchiveError);
});
