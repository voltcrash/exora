import { expect, test } from "vite-plus/test";
import { initialSceneAssetForSearch, solarMosaicPathForTier } from "./route-assets.ts";

test("initial routes preload the scene module they will mount", () => {
  expect(initialSceneAssetForSearch("")).toBe("planet");
  expect(initialSceneAssetForSearch("?planet=Mars")).toBe("planet");
  expect(initialSceneAssetForSearch("?custom=recipe")).toBe("planet");
  expect(initialSceneAssetForSearch("?star=Sirius")).toBe("star");
  expect(initialSceneAssetForSearch("?customStar=recipe")).toBe("star");
  expect(initialSceneAssetForSearch("?system=Sol")).toBe("system");
  expect(initialSceneAssetForSearch("?blackHole=Sagittarius+A*")).toBe("black-hole");
  expect(initialSceneAssetForSearch("?asteroid=Ceres")).toBe("asteroid");
  expect(initialSceneAssetForSearch("?comet=Halley")).toBe("comet");
  expect(initialSceneAssetForSearch("?mission=Voyager+1")).toBe("mission");
  expect(initialSceneAssetForSearch("?region=Kuiper+belt")).toBe("region");
});

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
