import { expect, test } from "vite-plus/test";
import {
  BLACK_HOLES,
  blackHoleNotableTrait,
  collectBlackHoles,
  findBlackHole,
  findProceduralBlackHole,
  formatBlackHoleMass,
  mergeBlackHoles,
  schwarzschildDiameterKilometers,
  searchBlackHoles,
} from "./black-holes.ts";

test("the curated black-hole catalog contains five unique real destinations", () => {
  expect(BLACK_HOLES).toHaveLength(5);
  expect(new Set(BLACK_HOLES.map(({ id }) => id)).size).toBe(5);
  expect(BLACK_HOLES.every(({ source }) => source.url?.startsWith("https://"))).toBe(true);
});

test("common and catalog aliases resolve without punctuation sensitivity", () => {
  expect(findBlackHole("sgr a*")?.name).toBe("Sagittarius A*");
  expect(findBlackHole("MESSIER 87 BLACK HOLE")?.name).toBe("M87*");
  expect(findBlackHole("Gaia DR3 4373465352415301632")?.name).toBe("Gaia BH1");
  expect(findBlackHole("not a black hole")).toBeUndefined();
});

test("derived size is explicitly the Schwarzschild reference diameter", () => {
  const cygnus = findBlackHole("Cygnus X-1");
  expect(cygnus).toBeDefined();
  expect(schwarzschildDiameterKilometers(cygnus!)).toBeCloseTo(125.22, 1);
  expect(formatBlackHoleMass(6_500_000_000)).toBe("6.5 billion M☉");
});

test("reconstructs a procedural deep link from its deterministic ID", () => {
  const blackHole = findProceduralBlackHole("exora-synthetic-42-0007");

  expect(blackHole).toMatchObject({
    id: "exora-synthetic-42-0007",
    name: "EXORA SYNTHETIC 0007",
    provenance: "procedural",
    status: "synthetic",
  });
  expect(findProceduralBlackHole("EXORA SYNTHETIC 0007")).toBeUndefined();
});

test("reports unavailable rather than formatting a fake observed mass", () => {
  expect(formatBlackHoleMass(null)).toBe("Mass unavailable");
});

test("collections group the catalog by how each horizon was measured", () => {
  const imaged = collectBlackHoles(BLACK_HOLES, "imaged-horizons");
  expect(imaged.map(({ name }) => name)).toEqual(["M87*", "Sagittarius A*"]);

  const nearest = collectBlackHoles(BLACK_HOLES, "nearest-horizons");
  expect(nearest[0]?.name).toBe("Gaia BH1");

  const heaviest = collectBlackHoles(BLACK_HOLES, "heaviest-engines");
  expect(heaviest[0]?.name).toBe("TON 618");

  expect(
    collectBlackHoles(BLACK_HOLES, "stellar-mass").every(({ kind }) => kind === "stellar-mass"),
  ).toBe(true);
});

test("search matches names, aliases and host galaxies without punctuation sensitivity", () => {
  expect(searchBlackHoles(BLACK_HOLES, "sgr a*").map(({ name }) => name)).toEqual([
    "Sagittarius A*",
  ]);
  expect(searchBlackHoles(BLACK_HOLES, "messier 87").map(({ name }) => name)).toEqual(["M87*"]);
  expect(searchBlackHoles(BLACK_HOLES, "").map(({ name }) => name)).toEqual([
    "Sagittarius A*",
    "M87*",
    "TON 618",
    "Cygnus X-1",
    "Gaia BH1",
  ]);
  expect(searchBlackHoles(BLACK_HOLES, "nothing here")).toEqual([]);
});

test("merging the archive over the curated five keeps one record per horizon", () => {
  const duplicate = { ...BLACK_HOLES[0]!, id: "blackcat-sgr-a-star" };
  const merged = mergeBlackHoles(BLACK_HOLES, [duplicate]);

  expect(merged).toHaveLength(BLACK_HOLES.length);
  expect(merged.find(({ name }) => name === "Sagittarius A*")?.id).toBe("sagittarius-a-star");
});

test("a notable trait names the observation rather than repeating the mass", () => {
  expect(blackHoleNotableTrait(findBlackHole("Sagittarius A*")!)).toBe("Directly imaged horizon");
  expect(blackHoleNotableTrait(findBlackHole("Cygnus X-1")!)).toBe("Feeding on a companion star");
});
