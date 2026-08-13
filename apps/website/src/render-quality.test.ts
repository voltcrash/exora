import { expect, test } from "vite-plus/test";
import { adaptHardwareScaling, deriveRenderQuality } from "./render-quality.ts";

test("selects a Quest-focused rendering budget", () => {
  const profile = deriveRenderQuality({
    userAgent: "Mozilla/5.0 (Linux; Android 12; Quest 3) OculusBrowser/35.0",
    pixelRatio: 2,
    hardwareConcurrency: 8,
    deviceMemory: 8,
  });

  expect(profile.tier).toBe("quest");
  expect(profile.starCount).toBeLessThan(700);
  expect(profile.planetSegments).toBeLessThan(64);
  expect(profile.xrFramebufferScaleFactor).toBeLessThan(1);
  expect(profile.xrFixedFoveation).toBeGreaterThan(0.5);
});

test("keeps the high-detail profile on capable desktops", () => {
  const profile = deriveRenderQuality({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
    pixelRatio: 2,
    hardwareConcurrency: 12,
    deviceMemory: 16,
  });

  expect(profile.tier).toBe("desktop");
  expect(profile.starCount).toBe(1_100);
  expect(profile.planetSegments).toBe(64);
});

test("reduces desktop resolution after sustained low frame rate", () => {
  const profile = deriveRenderQuality({ userAgent: "Desktop", pixelRatio: 1 });

  expect(adaptHardwareScaling(1, 42, profile, false)).toBe(1.15);
  expect(adaptHardwareScaling(1.6, 42, profile, false)).toBe(1.65);
  expect(adaptHardwareScaling(1.3, 60, profile, false)).toBe(1.2);
});

test("does not resize the canvas during an immersive session", () => {
  const profile = deriveRenderQuality({ userAgent: "Quest 3", pixelRatio: 2 });

  expect(adaptHardwareScaling(1.5, 30, profile, true)).toBe(1.5);
});
