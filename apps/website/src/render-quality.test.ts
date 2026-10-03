import { expect, test } from "vite-plus/test";
import { adaptHardwareScaling, deriveRenderQuality, shaderDefines } from "./render-quality.ts";

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

test("caps a HiDPI desktop at a stable initial render density", () => {
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

  expect(retina.hardwareScalingLevel).toBe(0.8);
  expect(standard.hardwareScalingLevel).toBe(1);
  expect(dense.hardwareScalingLevel).toBe(0.8);
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
  const profile = deriveRenderQuality({ userAgent: "Android Mobile", pixelRatio: 2 });

  expect(adaptHardwareScaling(1.5, 30, profile, true)).toBe(1.5);
});

test("bakes the octave budget into the shader defines", () => {
  const profile = deriveRenderQuality({ userAgent: "Android Mobile", pixelRatio: 1 });

  expect(profile.surfaceMicrodetail).toBe(false);
  expect(shaderDefines(profile)).toEqual([
    "#define FBM_OCTAVES 4",
    "#define MAX_GIANT_STORMS 3",
    "#define SURFACE_COLOR_DETAIL",
    "#define CLOUD_DETAIL",
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
