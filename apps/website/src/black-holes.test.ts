import { expect, test } from "vite-plus/test";
import {
  BLACK_HOLES,
  findBlackHole,
  findProceduralBlackHole,
  formatBlackHoleMass,
  schwarzschildDiameterKilometers,
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
