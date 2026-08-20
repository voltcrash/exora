import { expect, test } from "vite-plus/test";
import {
  HUD_DISTANCE,
  HUD_PITCH_RADIANS,
  hudPose,
  yawDirection,
  type XrVector,
} from "./xr-hud-pose.ts";

const EYE: XrVector = { x: 0, y: 1.6, z: 0 };
const LEVEL = { forward: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 } };

/** A head pitched by `degrees` (negative looks down) while facing +Z. */
const pitchedHead = (degrees: number): { forward: XrVector; up: XrVector } => {
  const radians = (degrees * Math.PI) / 180;
  return {
    forward: { x: 0, y: Math.sin(radians), z: Math.cos(radians) },
    up: { x: 0, y: Math.cos(radians), z: -Math.sin(radians) },
  };
};

const dot = (a: XrVector, b: XrVector): number => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a: XrVector): number => Math.hypot(a.x, a.y, a.z);

/** Componentwise, because a flattened axis can land on -0 and `toEqual` treats that as distinct. */
const expectVector = (actual: XrVector, expected: XrVector): void => {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.z).toBeCloseTo(expected.z, 6);
};

test("rests below the eyes at the full viewing distance", () => {
  const pose = hudPose(EYE, LEVEL.forward, LEVEL.up);

  expect(pose.position.y).toBeLessThan(EYE.y);
  expect(pose.position.y).toBeCloseTo(EYE.y - HUD_DISTANCE * Math.sin(HUD_PITCH_RADIANS), 6);
  const offset = {
    x: pose.position.x - EYE.x,
    y: pose.position.y - EYE.y,
    z: pose.position.z - EYE.z,
  };
  expect(length(offset)).toBeCloseTo(HUD_DISTANCE, 6);
});

test("leaves the forward view clear", () => {
  const pose = hudPose(EYE, LEVEL.forward, LEVEL.up);
  const offset = {
    x: pose.position.x - EYE.x,
    y: pose.position.y - EYE.y,
    z: pose.position.z - EYE.z,
  };
  // Half the panel's ~40 degree height has to still sit below a level gaze.
  const centreDegrees = (Math.asin(-offset.y / HUD_DISTANCE) * 180) / Math.PI;
  expect(centreDegrees - 20.4).toBeGreaterThan(10);
});

test("ignores head pitch, so looking down brings the panel into view", () => {
  const level = hudPose(EYE, LEVEL.forward, LEVEL.up);
  for (const degrees of [-40, -20, 15, 55]) {
    const head = pitchedHead(degrees);
    expect(hudPose(EYE, head.forward, head.up)).toEqual(level);
  }
});

test("follows head yaw", () => {
  const pose = hudPose(EYE, { x: 1, y: 0, z: 0 }, LEVEL.up);
  const reach = HUD_DISTANCE * Math.cos(HUD_PITCH_RADIANS);

  expect(pose.position.x).toBeCloseTo(EYE.x + reach, 6);
  expect(pose.position.z).toBeCloseTo(EYE.z, 6);
});

test("follows the wearer rather than being left behind", () => {
  const walked = { x: 12, y: 1.42, z: -7 };
  const pose = hudPose(walked, LEVEL.forward, LEVEL.up);

  expect(pose.position.x).toBeCloseTo(walked.x, 6);
  expect(pose.position.z).toBeCloseTo(walked.z + HUD_DISTANCE * Math.cos(HUD_PITCH_RADIANS), 6);
});

test("keeps the yaw when the head looks straight down or straight up", () => {
  // Pitched fully down the up axis carries the facing direction; fully up it carries its negation.
  expectVector(yawDirection({ x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }), { x: 0, y: 0, z: 1 });
  expectVector(yawDirection({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }), { x: 0, y: 0, z: 1 });
  expectVector(yawDirection({ x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }), { x: -1, y: 0, z: 0 });
});

test("falls back to a usable direction rather than a NaN transform", () => {
  const pose = hudPose(EYE, { x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 });

  for (const value of [pose.position.x, pose.position.y, pose.position.z]) {
    expect(Number.isFinite(value)).toBe(true);
  }
});

test("faces the eyes squarely", () => {
  const head = pitchedHead(-25);
  const pose = hudPose(EYE, head.forward, head.up);
  const toEye = {
    x: EYE.x - pose.position.x,
    y: EYE.y - pose.position.y,
    z: EYE.z - pose.position.z,
  };

  expect(length(pose.look)).toBeCloseTo(1, 6);
  expect(length(pose.up)).toBeCloseTo(1, 6);
  // The face looks back along the line to the eyes, and the up axis tilts with it.
  expect(pose.look.x).toBeCloseTo(toEye.x / HUD_DISTANCE, 6);
  expect(pose.look.y).toBeCloseTo(toEye.y / HUD_DISTANCE, 6);
  expect(pose.look.z).toBeCloseTo(toEye.z / HUD_DISTANCE, 6);
  expect(dot(pose.look, pose.up)).toBeCloseTo(0, 6);
});

test("reduces to a level head-on panel when the pitch is removed", () => {
  const pose = hudPose(EYE, LEVEL.forward, LEVEL.up, HUD_DISTANCE, 0);

  expectVector(pose.position, { x: 0, y: EYE.y, z: HUD_DISTANCE });
  expectVector(pose.look, { x: 0, y: 0, z: -1 });
  expectVector(pose.up, { x: 0, y: 1, z: 0 });
});
