import { expect, test, vi } from "vite-plus/test";
import { createKeyedCache, surfaceDetailSelectionForPalette } from "./texture-cache.ts";

test("reuses the same value for repeated requests instead of recreating it", () => {
  const factory = vi.fn((path: string) => ({ path }));
  const fallback = vi.fn((path: string) => ({ path: `fallback:${path}` }));
  const cache = createKeyedCache(factory, fallback);

  const first = cache.get("/textures/granite/normal.png");
  const second = cache.get("/textures/granite/normal.png");

  expect(second).toBe(first);
  expect(factory).toHaveBeenCalledTimes(1);
  expect(cache.size()).toBe(1);
});

test("creates independent values for distinct paths", () => {
  const factory = vi.fn((path: string) => ({ path }));
  const fallback = vi.fn((path: string) => ({ path: `fallback:${path}` }));
  const cache = createKeyedCache(factory, fallback);

  const normal = cache.get("/textures/basalt/normal.png");
  const roughness = cache.get("/textures/basalt/roughness.jpg");

  expect(normal).not.toBe(roughness);
  expect(cache.size()).toBe(2);
});

test("falls back once a factory fails, without retrying the bad load", () => {
  const factory = vi.fn(() => {
    throw new Error("decode failed");
  });
  const fallback = vi.fn((path: string) => ({ path: `fallback:${path}` }));
  const cache = createKeyedCache(factory, fallback);

  const first = cache.get("/textures/ice/normal.png");
  const second = cache.get("/textures/ice/normal.png");

  expect(first).toEqual({ path: "fallback:/textures/ice/normal.png" });
  expect(second).toEqual({ path: "fallback:/textures/ice/normal.png" });
  expect(factory).toHaveBeenCalledTimes(1);
  expect(fallback).toHaveBeenCalledTimes(2);
  expect(cache.size()).toBe(0);
});

test("selects chemistry and physical materials from the inferred rocky palette", () => {
  expect(surfaceDetailSelectionForPalette("sulfuric-yellow")).toMatchObject({
    chemistry: "sulfuric",
    primary: "cracked",
    secondary: "regolith",
  });
  expect(surfaceDetailSelectionForPalette("ice-blue")).toMatchObject({
    chemistry: "ice",
    primary: "ice",
  });
  expect(surfaceDetailSelectionForPalette("carbon-dark").chemistryStrength).toBeGreaterThan(
    surfaceDetailSelectionForPalette("silicate-neutral").chemistryStrength,
  );
});
