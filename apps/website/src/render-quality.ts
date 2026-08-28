export type RenderQualityTier = "desktop" | "mobile" | "quest";

export interface RenderQualityProfile {
  anisotropicFiltering: number;
  fbmOctaves: number;
  hardwareScalingLevel: number;
  maxRenderScale: number;
  maxHardwareScalingLevel: number;
  maxXrFixedFoveation: number;
  maxGiantStorms: number;
  planetIcoSubdivisions: number;
  planetSegments: number;
  ringTessellation: number;
  secondaryCloudDetail: boolean;
  starCount: number;
  systemBodySegments: number;
  systemOrbitSegments: number;
  surfaceMicrodetail: boolean;
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

export const shaderDefines = (profile: RenderQualityProfile): string[] => [
  `#define FBM_OCTAVES ${profile.fbmOctaves}`,
  `#define MAX_GIANT_STORMS ${profile.maxGiantStorms}`,
  ...(profile.surfaceColorDetail ? ["#define SURFACE_COLOR_DETAIL"] : []),
  ...(profile.surfaceMicrodetail ? ["#define SURFACE_MICRODETAIL"] : []),
  ...(profile.secondaryCloudDetail ? ["#define CLOUD_DETAIL"] : []),
];
