/**
 * Where the in-headset console rests relative to the wearer's head.
 *
 * The panel tracks the head's position and yaw but deliberately ignores its pitch, which is how the
 * Quest system keyboard behaves: it sits below the horizon, clear of the forward view, and the
 * wearer glances down to use it. Tracking yaw is what separates this from a world-locked panel — it
 * keeps the guarantee that walking, turning, and teleporting never leave the console behind, while
 * dropping the pitch is what stops it from crowding whatever the wearer is actually looking at.
 *
 * The arithmetic is plain numbers rather than Babylon vectors, so the sign conventions and the
 * looking-straight-down degeneracy can be checked without a headset or a GPU. Babylon's left-handed
 * basis is assumed throughout: +X right, +Y up, +Z forward.
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

/** Eye-to-panel distance. Held constant across the pitch so reach and text size are unchanged. */
export const HUD_DISTANCE = 1.55;
/**
 * How far below the horizon the panel centre rests.
 *
 * The panel subtends roughly 40 degrees at this distance, so 36 leaves its top edge some 15 degrees
 * clear of a level gaze — enough that it never crowds the forward view — while keeping it a
 * comfortable glance down rather than a full drop of the head.
 */
export const HUD_PITCH_RADIANS = (36 * Math.PI) / 180;

/** Below this, a direction's horizontal part is numerical noise and its yaw has to come elsewhere. */
const YAW_EPSILON = 1e-4;

/**
 * The head's facing direction flattened onto the horizontal plane.
 *
 * Looking straight up or down leaves nothing to flatten, but the yaw survives in the head's up
 * axis: pitched fully down it points along the facing direction, fully up it points against it.
 */
export const yawDirection = (forward: XrVector, up: XrVector): XrVector => {
  let x = forward.x;
  let z = forward.z;
  let length = Math.hypot(x, z);

  if (length < YAW_EPSILON) {
    const sign = forward.y < 0 ? 1 : -1;
    x = sign * up.x;
    z = sign * up.z;
    length = Math.hypot(x, z);
  }
  // Both axes vertical is not a pose a head can hold, but a fallback beats a NaN transform.
  if (length < YAW_EPSILON) return { x: 0, y: 0, z: 1 };

  return { x: x / length, y: 0, z: z / length };
};

/** Places the panel below the horizon on the head's yaw, tilted back to face the eyes squarely. */
export const hudPose = (
  eye: XrVector,
  forward: XrVector,
  up: XrVector,
  distance = HUD_DISTANCE,
  pitch = HUD_PITCH_RADIANS,
): XrHudPose => {
  const facing = yawDirection(forward, up);
  const cos = Math.cos(pitch);
  const sin = Math.sin(pitch);

  return {
    look: { x: -facing.x * cos, y: sin, z: -facing.z * cos },
    position: {
      x: eye.x + facing.x * distance * cos,
      y: eye.y - distance * sin,
      z: eye.z + facing.z * distance * cos,
    },
    up: { x: facing.x * sin, y: cos, z: facing.z * sin },
  };
};
