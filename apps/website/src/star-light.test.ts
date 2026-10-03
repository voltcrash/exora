import { expect, test } from "vite-plus/test";
import { diskLight, starLight } from "./star-light.ts";

const channels = (triplet: string): number[] => triplet.split(" ").map(Number);

test("a cool dwarf lights the interface warmer than a hot star", () => {
  const [coolRed, , coolBlue] = channels(starLight(3_200));
  const [hotRed, , hotBlue] = channels(starLight(12_000));

  expect(coolRed).toBeGreaterThan(coolBlue!);
  expect(hotBlue).toBeGreaterThan(hotRed!);
});

test("the light is lifted toward white so it reads as text on black", () => {
  for (const kelvin of [1_800, 3_000, 5_772, 9_000, 30_000]) {
    for (const channel of channels(starLight(kelvin))) {
      expect(channel).toBeGreaterThanOrEqual(Math.round(0.42 * 255));
      expect(channel).toBeLessThanOrEqual(255);
    }
  }
});

test("an unknown temperature falls back to the Sun's light", () => {
  expect(starLight(null)).toBe(starLight(5_772));
  expect(starLight(Number.NaN)).toBe(starLight(5_772));
  expect(starLight(undefined)).toBe(starLight(5_772));
});

test("a disk hue becomes a light of that hue", () => {
  const [red, green, blue] = channels(diskLight(28));
  expect(red).toBeGreaterThan(green!);
  expect(green).toBeGreaterThan(blue!);
  expect(channels(diskLight(220))[2]).toBeGreaterThan(channels(diskLight(220))[0]!);
});
