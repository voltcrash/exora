import { expect, test, vi } from "vite-plus/test";
import {
  chemistryTexturePath,
  createKeyedCache,
  detailTexturePath,
  surfaceDetailSelectionForPalette,
} from "./texture-cache.ts";

test("resolves surface detail assets to GPU-compressed KTX2 containers", () => {
  expect(detailTexturePath("granite", "normal")).toBe("/textures/granite/normal.ktx2");
  expect(detailTexturePath("basalt", "roughness")).toBe("/textures/basalt/roughness.ktx2");
  expect(chemistryTexturePath("sulfuric")).toBe("/textures/chemistry/sulfuric.ktx2");
});

test("reuses the same value for repeated requests instead of recreating it", () => {
  const factory = vi.fn((path: string) => ({ path }));
  const fallback = vi.fn((path: string) => ({ path: `fallback:${path}` }));
  const cache = createKeyedCache(factory, fallback);

  const first = cache.get("/textures/granite/normal.ktx2");
  const second = cache.get("/textures/granite/normal.ktx2");

  expect(second).toBe(first);
  expect(factory).toHaveBeenCalledTimes(1);
  expect(cache.size()).toBe(1);
});

test("creates independent values for distinct paths", () => {
  const factory = vi.fn((path: string) => ({ path }));
  const fallback = vi.fn((path: string) => ({ path: `fallback:${path}` }));
  const cache = createKeyedCache(factory, fallback);

  const normal = cache.get("/textures/basalt/normal.ktx2");
  const roughness = cache.get("/textures/basalt/roughness.ktx2");

  expect(normal).not.toBe(roughness);
  expect(cache.size()).toBe(2);
});

test("falls back once a factory fails, without retrying the bad load", () => {
  const factory = vi.fn(() => {
    throw new Error("decode failed");
  });
  const fallback = vi.fn((path: string) => ({ path: `fallback:${path}` }));
  const cache = createKeyedCache(factory, fallback);

  const first = cache.get("/textures/ice/normal.ktx2");
  const second = cache.get("/textures/ice/normal.ktx2");

  expect(first).toEqual({ path: "fallback:/textures/ice/normal.ktx2" });
  expect(second).toEqual({ path: "fallback:/textures/ice/normal.ktx2" });
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
