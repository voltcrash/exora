import { expect, test } from "vite-plus/test";
import { chooseImmersiveDestination } from "./variant-launch.ts";

test("Quest keeps immersive VR when a device reports both modes", () => {
  expect(
    chooseImmersiveDestination({ ar: true, launchUrl: "https://launch.example", vr: true }),
  ).toEqual({ launchUrl: null, mode: "vr" });
});

test("an AR-only phone enters immersive AR directly", () => {
  expect(chooseImmersiveDestination({ ar: true, launchUrl: null, vr: false })).toEqual({
    launchUrl: null,
    mode: "ar",
  });
});

test("an iPhone without native WebXR uses its Variant Launch Card", () => {
  expect(
    chooseImmersiveDestination({ ar: false, launchUrl: "https://launch.example", vr: false }),
  ).toEqual({ launchUrl: "https://launch.example", mode: "ar" });
});

test("a device with neither mode keeps the unavailable fallback", () => {
  expect(chooseImmersiveDestination({ ar: false, launchUrl: null, vr: false })).toBeNull();
});
