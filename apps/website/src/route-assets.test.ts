import { expect, test } from "vite-plus/test";
import { initialSceneAssetForSearch } from "./route-assets.ts";

test("initial routes preload the scene module they will mount", () => {
  expect(initialSceneAssetForSearch("")).toBe("planet");
  expect(initialSceneAssetForSearch("?planet=Mars")).toBe("planet");
  expect(initialSceneAssetForSearch("?custom=recipe")).toBe("planet");
  expect(initialSceneAssetForSearch("?star=Sirius")).toBe("star");
  expect(initialSceneAssetForSearch("?customStar=recipe")).toBe("star");
  expect(initialSceneAssetForSearch("?system=Sol")).toBe("system");
  expect(initialSceneAssetForSearch("?blackHole=Sagittarius+A*")).toBe("black-hole");
  expect(initialSceneAssetForSearch("?customBlackHole=recipe")).toBe("black-hole");
  expect(initialSceneAssetForSearch("?region=Kuiper+belt")).toBe("region");
});
