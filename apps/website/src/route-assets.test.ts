import { expect, test } from "vite-plus/test";
import { solarMosaicPathForTier } from "./route-assets.ts";

test("constrained tiers select smaller variants only for oversized route mosaics", () => {
  expect(solarMosaicPathForTier("/textures/solar-system/dione.jpg", "mobile")).toBe(
    "/textures/solar-system/dione-mobile.jpg",
  );
  expect(solarMosaicPathForTier("/textures/solar-system/dione.jpg", "quest")).toBe(
    "/textures/solar-system/dione-mobile.jpg",
  );
  expect(solarMosaicPathForTier("/textures/solar-system/dione.jpg", "desktop")).toBe(
    "/textures/solar-system/dione.jpg",
  );
  expect(solarMosaicPathForTier("/textures/solar-system/earth.jpg", "mobile")).toBe(
    "/textures/solar-system/earth.jpg",
  );
});
