/**
 * Where the windowed in-headset Discover screen rests relative to the wearer's head.
 *
 * The screen tracks position and yaw but ignores pitch, keeping a stable reading surface while
 * walking, turning and teleporting. It sits nine degrees below level at a fixed comfortable
 * distance rather than expanding to the eye projection.
 */

export interface XrVector {
  x: number;
  y: number;
  z: number;
}

export interface XrHudPose {
  look: XrVector;
  position: XrVector;
  up: XrVector;
}

export const HUD_DISTANCE = 1.85;
export const HUD_PITCH_RADIANS = (9 * Math.PI) / 180;

const YAW_EPSILON = 1e-4;

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
  if (length < YAW_EPSILON) return { x: 0, y: 0, z: 1 };
  return { x: x / length, y: 0, z: z / length };
};

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
