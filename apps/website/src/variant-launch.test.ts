import { expect, test } from "vite-plus/test";
import { chooseImmersiveDestination } from "./variant-launch.ts";

test("a phone with native WebXR enters immersive AR directly", () => {
  expect(chooseImmersiveDestination({ ar: true, launchUrl: "https://launch.example" })).toEqual({
    launchUrl: null,
  });
});

test("an iPhone without native WebXR uses its Variant Launch Card", () => {
  expect(chooseImmersiveDestination({ ar: false, launchUrl: "https://launch.example" })).toEqual({
    launchUrl: "https://launch.example",
  });
});

test("a device with neither mode keeps the unavailable fallback", () => {
  expect(chooseImmersiveDestination({ ar: false, launchUrl: null })).toBeNull();
});
