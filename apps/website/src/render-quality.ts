export type RenderQualityTier = "desktop" | "mobile" | "quest";

export interface RenderQualityProfile {
  /** Octaves the fractal-noise shaders spend per pixel, the dominant fragment cost. */
  fbmOctaves: number;
  hardwareScalingLevel: number;
  maxHardwareScalingLevel: number;
  /** Ceiling for foveation once a struggling immersive session starts trading edge detail. */
  maxXrFixedFoveation: number;
  /** How many storms a gas/ice giant's fragment shader evaluates per pixel, the dominant cost
   * of the multi-storm loop. A recipe's own `bandDetail.stormCount` is clamped to this. */
  maxGiantStorms: number;
  moonSegments: number;
  /** Icosphere subdivision level for rocky planets (vertex count ~= 10 * n^2 + 2), chosen to
   * roughly match planetSegments' vertex density on a UV sphere at the same tier. */
  planetIcoSubdivisions: number;
  planetSegments: number;
  ringTessellation: number;
  /** Whether the cloud shell samples a second, higher-frequency noise octave group for
   * finer multi-scale structure. Off on fill-rate-constrained tiers. */
  secondaryCloudDetail: boolean;
  starCount: number;
  /** Whether rocky planets sample the triplanar PBR microdetail textures (normal + roughness).
   * Off on fill-rate-constrained tiers so they keep the cheaper pure-procedural surface. */
  surfaceMicrodetail: boolean;
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
      starCount: 460,
      planetSegments: 40,
      planetIcoSubdivisions: 8,
      moonSegments: 14,
      ringTessellation: 56,
      fbmOctaves: 3,
      maxGiantStorms: 1,
      surfaceMicrodetail: false,
      secondaryCloudDetail: false,
      hardwareScalingLevel: roundScale(Math.max(1.3, pixelRatio / 1.2)),
      maxHardwareScalingLevel: 2,
      xrFramebufferScaleFactor: 0.72,
      xrFixedFoveation: 0.8,
      maxXrFixedFoveation: 1,
    };
  }

  if (isQuest) {
    return {
      tier: "quest",
      starCount: 620,
      planetSegments: 48,
      planetIcoSubdivisions: 10,
      moonSegments: 16,
      ringTessellation: 72,
      fbmOctaves: 4,
      maxGiantStorms: 2,
      surfaceMicrodetail: false,
      secondaryCloudDetail: false,
      hardwareScalingLevel: roundScale(Math.max(1.2, pixelRatio / 1.35)),
      maxHardwareScalingLevel: 1.9,
      xrFramebufferScaleFactor: 0.82,
      xrFixedFoveation: 0.65,
      maxXrFixedFoveation: 0.9,
    };
  }

  if (isConstrainedMobile) {
    return {
      tier: "mobile",
      starCount: 760,
      planetSegments: 52,
      planetIcoSubdivisions: 12,
      moonSegments: 18,
      ringTessellation: 80,
      fbmOctaves: 4,
      maxGiantStorms: 3,
      surfaceMicrodetail: false,
      secondaryCloudDetail: true,
      hardwareScalingLevel: roundScale(Math.max(1.1, pixelRatio / 1.5)),
      maxHardwareScalingLevel: 1.8,
      xrFramebufferScaleFactor: 0.88,
      xrFixedFoveation: 0.5,
      maxXrFixedFoveation: 0.85,
    };
  }

  return {
    tier: "desktop",
    starCount: 1_100,
    planetSegments: 64,
    planetIcoSubdivisions: 14,
    moonSegments: 24,
    ringTessellation: 128,
    fbmOctaves: 5,
    maxGiantStorms: 3,
    surfaceMicrodetail: true,
    secondaryCloudDetail: true,
    hardwareScalingLevel: roundScale(Math.max(1, pixelRatio / 1.65)),
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
  ...(profile.surfaceMicrodetail ? ["#define SURFACE_MICRODETAIL"] : []),
  ...(profile.secondaryCloudDetail ? ["#define CLOUD_DETAIL"] : []),
];
