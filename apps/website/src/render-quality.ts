export type RenderQualityTier = "desktop" | "mobile" | "quest";

export interface RenderQualityProfile {
  hardwareScalingLevel: number;
  maxHardwareScalingLevel: number;
  moonSegments: number;
  planetSegments: number;
  ringTessellation: number;
  starCount: number;
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
  const isQuest = /OculusBrowser|Meta Quest|Quest 2|Quest 3/i.test(userAgent);
  const isConstrainedMobile =
    /Android|Mobile/i.test(userAgent) ||
    (deviceMemory !== undefined && deviceMemory <= 4) ||
    (hardwareConcurrency !== undefined && hardwareConcurrency <= 4);

  if (isQuest) {
    return {
      tier: "quest",
      starCount: 620,
      planetSegments: 48,
      moonSegments: 16,
      ringTessellation: 72,
      hardwareScalingLevel: roundScale(Math.max(1.2, pixelRatio / 1.35)),
      maxHardwareScalingLevel: 1.9,
      xrFramebufferScaleFactor: 0.82,
      xrFixedFoveation: 0.65,
    };
  }

  if (isConstrainedMobile) {
    return {
      tier: "mobile",
      starCount: 760,
      planetSegments: 52,
      moonSegments: 18,
      ringTessellation: 80,
      hardwareScalingLevel: roundScale(Math.max(1.1, pixelRatio / 1.5)),
      maxHardwareScalingLevel: 1.8,
      xrFramebufferScaleFactor: 0.88,
      xrFixedFoveation: 0.5,
    };
  }

  return {
    tier: "desktop",
    starCount: 1_100,
    planetSegments: 64,
    moonSegments: 24,
    ringTessellation: 128,
    hardwareScalingLevel: roundScale(Math.max(1, pixelRatio / 1.65)),
    maxHardwareScalingLevel: 1.65,
    xrFramebufferScaleFactor: 1,
    xrFixedFoveation: 0.35,
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
