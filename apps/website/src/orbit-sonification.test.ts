import { expect, test } from "vite-plus/test";
import { HIGHEST_HZ, LOWEST_HZ, nearestSimpleRatio, orbitPitches } from "./orbit-sonification.ts";

test("the innermost world takes the top note and the rest keep their orbital ratios", () => {
  const [inner, outer] = orbitPitches([2, 3]);

  expect(inner).toBe(HIGHEST_HZ);
  expect(inner! / outer!).toBeCloseTo(1.5, 9);
});

test("distant worlds fold up by octaves into the playable range without losing pitch class", () => {
  const pitches = orbitPitches([1, 1_000]);
  const folded = pitches[1]!;

  expect(folded).toBeGreaterThanOrEqual(LOWEST_HZ);
  expect(folded).toBeLessThanOrEqual(HIGHEST_HZ);
  const octaves = Math.log2(HIGHEST_HZ / 1_000 / folded);
  expect(octaves).toBeCloseTo(Math.round(octaves), 9);
});

test("worlds without a period stay silent", () => {
  expect(orbitPitches([null, 4])).toEqual([null, HIGHEST_HZ]);
  expect(orbitPitches([null])).toEqual([null]);
});

test("TRAPPIST-1's neighbours are heard as the simple ratios they are locked in", () => {
  expect(nearestSimpleRatio(2.421_937 / 1.510_826)).toBe("8:5");
  expect(nearestSimpleRatio(6.099_043 / 4.049_219)).toBe("3:2");
  expect(nearestSimpleRatio(Math.PI)).toBeNull();
});
