import { expect, test } from "vite-plus/test";
import {
  adaptFixedFoveation,
  adaptHardwareScaling,
  deriveRenderQuality,
  shaderDefines,
} from "./render-quality.ts";

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
  expect(profile.surfaceMicrodetail).toBe(true);
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

test("gives Quest 2 a lighter budget than a Quest 3", () => {
  const questTwo = deriveRenderQuality({
    userAgent: "Mozilla/5.0 (X11; Linux x86_64; Quest 2) OculusBrowser/33.0",
    pixelRatio: 1,
  });
  const questThree = deriveRenderQuality({
    userAgent: "Mozilla/5.0 (X11; Linux x86_64; Quest 3) OculusBrowser/35.0",
    pixelRatio: 1,
  });

  expect(questTwo.tier).toBe("quest");
  expect(questTwo.fbmOctaves).toBeLessThan(questThree.fbmOctaves);
  expect(questTwo.planetSegments).toBeLessThan(questThree.planetSegments);
  expect(questTwo.xrFramebufferScaleFactor).toBeLessThan(questThree.xrFramebufferScaleFactor);
  expect(questTwo.xrFixedFoveation).toBeGreaterThan(questThree.xrFixedFoveation);
});

test("treats an unrecognised headset as the weaker one", () => {
  const profile = deriveRenderQuality({ userAgent: "OculusBrowser/33.0", pixelRatio: 1 });

  expect(profile.tier).toBe("quest");
  expect(profile.fbmOctaves).toBe(3);
});

test("raises foveation only while the session misses the refresh rate", () => {
  const profile = deriveRenderQuality({ userAgent: "Quest 2", pixelRatio: 1 });

  expect(adaptFixedFoveation(profile.xrFixedFoveation, 50, profile)).toBe(0.9);
  expect(adaptFixedFoveation(1, 50, profile)).toBe(1);
  expect(adaptFixedFoveation(0.9, 72, profile)).toBe(0.85);
  expect(adaptFixedFoveation(profile.xrFixedFoveation, 72, profile)).toBe(0.8);
  expect(adaptFixedFoveation(0.9, 66, profile)).toBe(0.9);
});

test("bakes the octave budget into the shader defines", () => {
  const profile = deriveRenderQuality({ userAgent: "Quest 2", pixelRatio: 1 });

  expect(profile.surfaceMicrodetail).toBe(false);
  expect(shaderDefines(profile)).toEqual(["#define FBM_OCTAVES 3"]);
});

test("only enables triplanar surface microdetail on the desktop tier", () => {
  const profile = deriveRenderQuality({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
    pixelRatio: 2,
  });

  expect(shaderDefines(profile)).toEqual(["#define FBM_OCTAVES 5", "#define SURFACE_MICRODETAIL"]);
});
