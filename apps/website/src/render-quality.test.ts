import { expect, test } from "vite-plus/test";
import {
  adaptFixedFoveation,
  adaptHardwareScaling,
  deriveRenderQuality,
  shaderDefines,
} from "./render-quality.ts";

const desktopProfile = deriveRenderQuality({
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
  pixelRatio: 2,
  hardwareConcurrency: 12,
  deviceMemory: 16,
});

test("selects a Quest-focused rendering budget", () => {
  const profile = deriveRenderQuality({
    userAgent: "Mozilla/5.0 (Linux; Android 12; Quest 3) OculusBrowser/35.0",
    pixelRatio: 2,
    hardwareConcurrency: 8,
    deviceMemory: 8,
  });

  expect(profile.tier).toBe("quest");
  // Compared against the desktop budget rather than a literal, so retuning the absolute counts
  // does not break a test whose point is the relationship between the tiers.
  expect(profile.starCount).toBeLessThan(desktopProfile.starCount);
  expect(profile.planetSegments).toBeLessThan(96);
  expect(profile.xrFramebufferScaleFactor).toBeLessThanOrEqual(1);
  expect(profile.xrFixedFoveation).toBeGreaterThanOrEqual(0.4);
  expect(profile.surfaceMicrodetail).toBe(true);
});

test("keeps the high-detail profile on capable desktops", () => {
  const profile = deriveRenderQuality({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
    pixelRatio: 2,
    hardwareConcurrency: 12,
    deviceMemory: 16,
  });

  expect(profile.tier).toBe("desktop");
  expect(profile.starCount).toBe(2_400);
  expect(profile.planetSegments).toBe(96);
  expect(profile.surfaceMicrodetail).toBe(true);
});

test("renders at the display's native pixel density on a HiDPI desktop", () => {
  const retina = deriveRenderQuality({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
    pixelRatio: 2,
    hardwareConcurrency: 12,
    deviceMemory: 16,
  });
  const standard = deriveRenderQuality({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
    pixelRatio: 1,
  });
  const dense = deriveRenderQuality({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
    pixelRatio: 3,
  });

  // Babylon renders at cssPixels / hardwareScalingLevel, so 0.5 on a 2x panel is native.
  expect(retina.hardwareScalingLevel).toBe(0.5);
  expect(standard.hardwareScalingLevel).toBe(1);
  // A 3x panel is capped at the tier's 2x ceiling rather than paying for full density.
  expect(dense.hardwareScalingLevel).toBe(0.5);
});

test("never derives a non-finite scaling level from a bogus pixel ratio", () => {
  for (const pixelRatio of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const profile = deriveRenderQuality({ userAgent: "Desktop", pixelRatio });

    expect(Number.isFinite(profile.hardwareScalingLevel)).toBe(true);
    expect(profile.hardwareScalingLevel).toBeGreaterThan(0);
  }
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
  expect(questTwo.surfaceColorDetail).toBe(true);
  expect(questTwo.surfaceMicrodetail).toBe(false);
});

test("treats an unrecognised headset as the weaker one", () => {
  const profile = deriveRenderQuality({ userAgent: "OculusBrowser/33.0", pixelRatio: 1 });

  expect(profile.tier).toBe("quest");
  expect(profile.fbmOctaves).toBe(4);
});

test("raises foveation only while the session misses the refresh rate", () => {
  const profile = deriveRenderQuality({ userAgent: "Quest 2", pixelRatio: 1 });

  expect(adaptFixedFoveation(profile.xrFixedFoveation, 50, profile)).toBe(0.65);
  expect(adaptFixedFoveation(1, 50, profile)).toBe(0.85);
  expect(adaptFixedFoveation(0.65, 72, profile)).toBe(0.6);
  expect(adaptFixedFoveation(profile.xrFixedFoveation, 72, profile)).toBe(0.55);
  expect(adaptFixedFoveation(0.9, 66, profile)).toBe(0.9);
});

test("bakes the octave budget into the shader defines", () => {
  const profile = deriveRenderQuality({ userAgent: "Quest 2", pixelRatio: 1 });

  expect(profile.surfaceMicrodetail).toBe(false);
  expect(shaderDefines(profile)).toEqual([
    "#define FBM_OCTAVES 4",
    "#define MAX_GIANT_STORMS 1",
    "#define SURFACE_COLOR_DETAIL",
  ]);
});

test("enables triplanar surface microdetail on a capable desktop tier", () => {
  const profile = deriveRenderQuality({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
    pixelRatio: 2,
  });

  expect(shaderDefines(profile)).toEqual([
    "#define FBM_OCTAVES 5",
    "#define MAX_GIANT_STORMS 3",
    "#define SURFACE_COLOR_DETAIL",
    "#define SURFACE_MICRODETAIL",
    "#define CLOUD_DETAIL",
  ]);
});
