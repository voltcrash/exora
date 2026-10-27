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
  expect(initialSceneAssetForSearch("?region=Kuiper+belt")).toBe("region");
});

test("constrained tiers select smaller variants only for oversized route mosaics", () => {
  expect(solarMosaicPathForTier("/textures/solar-system/dione.ktx2", "mobile")).toBe(
    "/textures/solar-system/dione-mobile.ktx2",
  );
  expect(solarMosaicPathForTier("/textures/solar-system/dione.ktx2", "desktop")).toBe(
    "/textures/solar-system/dione.ktx2",
  );
  expect(solarMosaicPathForTier("/textures/solar-system/earth.ktx2", "mobile")).toBe(
    "/textures/solar-system/earth.ktx2",
  );
});
