export const SURFACE_EYE_HEIGHT = 1.65;
export const SURFACE_WALK_LIMIT = 106;

export const siteBearing = (seed: number) =>
  ((Math.imul(seed ^ (seed >>> 16), 0x9e3779b1) >>> 0) / 4294967296) * Math.PI * 2;

export function sitePosition(seed: number, across: number, forward: number) {
  const yaw = siteBearing(seed);
  return {
    x: across * Math.cos(yaw) + forward * Math.sin(yaw),
    z: across * Math.sin(yaw) - forward * Math.cos(yaw),
  };
}
