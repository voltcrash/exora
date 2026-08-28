export type RenderQualityTier = "desktop" | "mobile" | "quest";

export interface RenderQualityProfile {
  /** Anisotropic filtering samples for the rocky triplanar detail maps. Grazing-angle terrain is
   * most of a planet's visible surface, so this is what keeps the detail from smearing there. */
  anisotropicFiltering: number;
  /** Octaves the fractal-noise shaders spend per pixel, the dominant fragment cost. */
  fbmOctaves: number;
  /**
   * Babylon renders at `cssPixels / hardwareScalingLevel`, so a level below 1 renders *above*
   * CSS resolution — which is what a HiDPI display needs to look sharp rather than upscaled.
   * Derived from the device pixel ratio and the tier's `maxRenderScale`.
   */
  hardwareScalingLevel: number;
  /** Device pixels per CSS pixel this tier is willing to actually render. Caps the cost on a
   * 3x phone panel without capping a 2x laptop below its native resolution. */
  maxRenderScale: number;
  maxHardwareScalingLevel: number;
  /** Ceiling for foveation once a struggling immersive session starts trading edge detail. */
  maxXrFixedFoveation: number;
  /** How many storms a gas/ice giant's fragment shader evaluates per pixel, the dominant cost
   * of the multi-storm loop. A recipe's own `bandDetail.stormCount` is clamped to this. */
  maxGiantStorms: number;
  /** Icosphere subdivision level for rocky planets (vertex count ~= 10 * n^2 + 2), chosen to
   * roughly match planetSegments' vertex density on a UV sphere at the same tier. */
  planetIcoSubdivisions: number;
  planetSegments: number;
  ringTessellation: number;
  /** Whether the cloud shell samples a second, higher-frequency noise octave group for
   * finer multi-scale structure. Off on fill-rate-constrained tiers. */
  secondaryCloudDetail: boolean;
  /**
   * Ceiling on the background stars drawn per scene.
   *
   * A budget rather than a target. The sky is a real catalogue re-observed from wherever the
   * visitor is standing, so how many stars are visible at all is a fact about that place; this
   * caps how many of them a device is asked to draw, brightest first, and a viewpoint with fewer
   * naked-eye stars than the budget simply gets fewer. Only the seeded fallback, which has no
   * such fact to answer to, always draws exactly this many.
   *
   * The cost is one point per star in a single draw call, so a desktop can spend freely here. The
   * headset tiers stay low because their fill rate is the scarcest thing in the renderer.
   */
  starCount: number;
  /**
   * Sphere segments for a body in the system diorama.
   *
   * A diorama draws every confirmed world in a host system at once, so its geometry budget is
   * per-system rather than per-planet: seven bodies at `planetSegments` would cost more than the
   * single full-detail world the same tier is sized for, to draw spheres a few dozen pixels
   * across. They stay coarse here and are only promoted to the full procedural surface on
   * arrival, when one of them becomes the subject of its own scene.
   */
  systemBodySegments: number;
  /** Segments around one drawn orbit. Each is a thin four-sided tube, so this is its whole cost. */
  systemOrbitSegments: number;
  /** Whether rocky planets sample the triplanar PBR microdetail textures (normal + roughness).
   * Off on fill-rate-constrained tiers so they keep the cheaper pure-procedural surface. */
  surfaceMicrodetail: boolean;
  /** A single chemistry-specific triplanar color texture. At three texture reads per fragment it
   * is cheap enough to keep rocky worlds materially distinct on mobile and Quest. */
  surfaceColorDetail: boolean;
  tier: RenderQualityTier;
  xrFixedFoveation: number;
  xrFramebufferScaleFactor: number;
}

export interface DeviceCapabilities {
  deviceMemory?: number;
  hardwareConcurrency?: number;
  pixelRatio: number;
  userAgent: string;
}

const roundScale = (value: number): number => Math.round(value * 20) / 20;

/**
 * Converts a device pixel ratio into a Babylon hardware scaling level, rendering at the device's
 * own pixel density up to the tier's ceiling.
 *
 * A HiDPI panel reports pixelRatio 2-3; rendering at CSS resolution there (level 1) means every
 * frame is upscaled 2-3x before it reaches the glass, which reads as soft, low-detail surfaces no
 * matter how much detail the shaders generate. Level = 1 / min(pixelRatio, maxRenderScale) makes
 * the backing store match the display (level 0.5 on a 2x screen) while still refusing to pay for
 * more than `maxRenderScale` on very dense panels.
 */
const scalingLevelForDisplay = (pixelRatio: number, maxRenderScale: number): number => {
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
  return roundScale(1 / Math.min(ratio, maxRenderScale));
};

export const deriveRenderQuality = ({
  deviceMemory,
  hardwareConcurrency,
  pixelRatio,
  userAgent,
}: DeviceCapabilities): RenderQualityProfile => {
  const isQuest = /OculusBrowser|Meta Quest|Quest \d|Quest Pro/i.test(userAgent);
  /**
   * Quest 2 runs the first-generation XR2 with roughly half the fill rate of a Quest 3, and
   * it is the headset Exora targets. A headset that does not clearly announce itself as a
   * newer model also lands here, so an unrecognised device errs towards holding frame rate.
   */
  const isFirstGenerationQuest = isQuest && !/Quest (Pro|[3-9])/i.test(userAgent);
  const isConstrainedMobile =
    /Android|Mobile/i.test(userAgent) ||
    (deviceMemory !== undefined && deviceMemory <= 4) ||
    (hardwareConcurrency !== undefined && hardwareConcurrency <= 4);

  if (isFirstGenerationQuest) {
    return {
      tier: "quest",
      starCount: 420,
      planetSegments: 48,
      planetIcoSubdivisions: 12,
      ringTessellation: 56,
      systemBodySegments: 12,
      systemOrbitSegments: 72,
      fbmOctaves: 4,
      maxGiantStorms: 1,
      anisotropicFiltering: 4,
      surfaceColorDetail: true,
      surfaceMicrodetail: false,
      secondaryCloudDetail: false,
      // The headset renders through its own XR framebuffer scale, so the flat-panel scaling
      // level only applies to the pre-session preview; keep it conservative here.
      maxRenderScale: 1,
      hardwareScalingLevel: roundScale(Math.max(1.3, pixelRatio / 1.2)),
      maxHardwareScalingLevel: 2,
      xrFramebufferScaleFactor: 0.9,
      xrFixedFoveation: 0.55,
      maxXrFixedFoveation: 0.85,
    };
  }

  if (isQuest) {
    return {
      tier: "quest",
      starCount: 620,
      planetSegments: 60,
      planetIcoSubdivisions: 14,
      ringTessellation: 72,
      systemBodySegments: 14,
      systemOrbitSegments: 96,
      fbmOctaves: 5,
      maxGiantStorms: 2,
      anisotropicFiltering: 4,
      surfaceColorDetail: true,
      // KTX2 keeps both selected normal/roughness families GPU-compressed, making the richer
      // surface affordable on newer Quest hardware without the old uncompressed VRAM spike.
      surfaceMicrodetail: true,
      secondaryCloudDetail: false,
      maxRenderScale: 1,
      hardwareScalingLevel: roundScale(Math.max(1.2, pixelRatio / 1.35)),
      maxHardwareScalingLevel: 1.9,
      xrFramebufferScaleFactor: 1,
      xrFixedFoveation: 0.4,
      maxXrFixedFoveation: 0.72,
    };
  }

  if (isConstrainedMobile) {
    return {
      tier: "mobile",
      starCount: 1_000,
      planetSegments: 52,
      planetIcoSubdivisions: 12,
      ringTessellation: 80,
      systemBodySegments: 14,
      systemOrbitSegments: 96,
      fbmOctaves: 4,
      maxGiantStorms: 3,
      anisotropicFiltering: 8,
      surfaceColorDetail: true,
      surfaceMicrodetail: false,
      secondaryCloudDetail: true,
      // Phone panels report 2-3x; 1.5x keeps text and planet limbs crisp without paying for a
      // full 3x fill rate on a thermally limited GPU.
      maxRenderScale: 1.5,
      hardwareScalingLevel: scalingLevelForDisplay(pixelRatio, 1.5),
      maxHardwareScalingLevel: 1.8,
      xrFramebufferScaleFactor: 0.88,
      xrFixedFoveation: 0.5,
      maxXrFixedFoveation: 0.85,
    };
  }

  return {
    tier: "desktop",
    starCount: 2_400,
    planetSegments: 96,
    planetIcoSubdivisions: 18,
    ringTessellation: 128,
    systemBodySegments: 24,
    systemOrbitSegments: 160,
    fbmOctaves: 5,
    maxGiantStorms: 3,
    anisotropicFiltering: 16,
    surfaceColorDetail: true,
    surfaceMicrodetail: true,
    secondaryCloudDetail: true,
    // A native 2x backing store on a Retina display consumes four times the pixels of the CSS
    // viewport before MSAA, post-processing, or scene textures are allocated. A 1.25x ceiling
    // keeps the first world within the GPU budget of browsers that isolate each tab, while the
    // adaptive downscaler still has room to respond to a heavier destination.
    maxRenderScale: 1.25,
    hardwareScalingLevel: scalingLevelForDisplay(pixelRatio, 1.25),
    maxHardwareScalingLevel: 1.65,
    xrFramebufferScaleFactor: 1,
    xrFixedFoveation: 0.35,
    maxXrFixedFoveation: 0.6,
  };
};

export const adaptHardwareScaling = (
  currentLevel: number,
  fps: number,
  profile: RenderQualityProfile,
  isInXr: boolean,
): number => {
  if (isInXr) return currentLevel;

  if (fps < 48) {
    return roundScale(Math.min(profile.maxHardwareScalingLevel, currentLevel + 0.15));
  }

  if (fps > 58 && currentLevel > profile.hardwareScalingLevel) {
    return roundScale(Math.max(profile.hardwareScalingLevel, currentLevel - 0.1));
  }

  return currentLevel;
};

/**
 * Adjusts fixed foveation to defend the headset refresh rate.
 *
 * The framebuffer scale is fixed for the lifetime of a session and hardware scaling does not
 * apply to the XR render target, so foveation is the only quality knob left once the wearer
 * is inside the headset. Quest 2 targets 72 Hz, so the recovery threshold sits just below it.
 */
export const adaptFixedFoveation = (
  current: number,
  fps: number,
  profile: RenderQualityProfile,
): number => {
  if (fps < 62) {
    return roundScale(Math.min(profile.maxXrFixedFoveation, current + 0.1));
  }

  if (fps > 70 && current > profile.xrFixedFoveation) {
    return roundScale(Math.max(profile.xrFixedFoveation, current - 0.05));
  }

  return current;
};

/**
 * Compile-time defines shared by the procedural shaders.
 *
 * Fractal noise is evaluated several times per pixel, twice over in an immersive session, so
 * the octave count is baked in per device tier rather than paid for uniformly everywhere.
 */
export const shaderDefines = (profile: RenderQualityProfile): string[] => [
  `#define FBM_OCTAVES ${profile.fbmOctaves}`,
  `#define MAX_GIANT_STORMS ${profile.maxGiantStorms}`,
  ...(profile.surfaceColorDetail ? ["#define SURFACE_COLOR_DETAIL"] : []),
  ...(profile.surfaceMicrodetail ? ["#define SURFACE_MICRODETAIL"] : []),
  ...(profile.secondaryCloudDetail ? ["#define CLOUD_DETAIL"] : []),
];
