/**
 * Where the in-headset Discover screen rests relative to the wearer's head.
 *
 * Discover fills the browser window, so in a session it is placed to fill the headset view too.
 * The screen follows the complete head pose while it is open: position, yaw, pitch and roll. That
 * keeps its centre on the optical axis and lets `xr-panel.ts` cover the current eye projections
 * without leaving strips of the world visible around a supposedly full-screen modal.
 *
 * The arithmetic is plain numbers rather than Babylon vectors, so projection coverage and pose
 * fallbacks can be checked without a headset or a GPU. Babylon's left-handed basis is assumed
 * throughout: +X right, +Y up, +Z forward.
 */

export interface XrVector {
  x: number;
  y: number;
  z: number;
}

export interface XrHudPose {
  /** Direction the panel's face looks along, ie. from the panel back toward the eyes. */
  look: XrVector;
  position: XrVector;
  /** The panel's own up axis, tilted back with the pitch so it still reads square-on. */
  up: XrVector;
}

/** Eye-to-screen distance. Held constant so controller reach and text size remain predictable. */
export const HUD_DISTANCE = 1.85;
/** Slight overscan hides raster rounding and the separation between the two eye projections. */
export const HUD_FILL_OVERSCAN = 1.02;

const VECTOR_EPSILON = 1e-4;

/**
 * Returns a normalized direction, falling back only for a malformed tracking pose.
 */
const direction = (value: XrVector, fallback: XrVector): XrVector => {
  const length = Math.hypot(value.x, value.y, value.z);
  if (length < VECTOR_EPSILON) return fallback;
  return { x: value.x / length, y: value.y / length, z: value.z / length };
};

/** Places the screen squarely in front of the current headset pose. */
export const hudPose = (
  eye: XrVector,
  forward: XrVector,
  up: XrVector,
  distance = HUD_DISTANCE,
): XrHudPose => {
  const facing = direction(forward, { x: 0, y: 0, z: 1 });
  const panelUp = direction(up, { x: 0, y: 1, z: 0 });

  return {
    look: { x: -facing.x, y: -facing.y, z: -facing.z },
    position: {
      x: eye.x + facing.x * distance,
      y: eye.y + facing.y * distance,
      z: eye.z + facing.z * distance,
    },
    up: panelUp,
  };
};

/**
 * Axis scales that make the panel fill one headset eye's perspective projection.
 *
 * Perspective matrices store the horizontal and vertical focal scales at indices 0 and 5. At a
 * known distance their reciprocals give the half-frustum dimensions. Scaling each axis to its own
 * ratio keeps the complete panel reachable instead of cropping its edge controls on a projection
 * whose aspect ratio differs from the canvas.
 */
export const hudProjectionFillScale = (
  projection: ArrayLike<number>,
  panelWidth: number,
  panelHeight: number,
  distance = HUD_DISTANCE,
  overscan = HUD_FILL_OVERSCAN,
): { x: number; y: number } => {
  const horizontalFocalScale = Math.abs(projection[0] ?? 0);
  const verticalFocalScale = Math.abs(projection[5] ?? 0);
  if (
    horizontalFocalScale < VECTOR_EPSILON ||
    verticalFocalScale < VECTOR_EPSILON ||
    panelWidth < VECTOR_EPSILON ||
    panelHeight < VECTOR_EPSILON ||
    distance < VECTOR_EPSILON
  ) {
    return { x: 1, y: 1 };
  }

  const frustumWidth = (2 * distance) / horizontalFocalScale;
  const frustumHeight = (2 * distance) / verticalFocalScale;
  const margin = Math.max(1, overscan);
  const x = (frustumWidth / panelWidth) * margin;
  const y = (frustumHeight / panelHeight) * margin;
  return {
    x: Number.isFinite(x) ? Math.max(1, x) : 1,
    y: Number.isFinite(y) ? Math.max(1, y) : 1,
  };
};
