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

const pitchedHead = (degrees: number): { forward: XrVector; up: XrVector } => {
  const radians = (degrees * Math.PI) / 180;
  return {
    forward: { x: 0, y: Math.sin(radians), z: Math.cos(radians) },
    up: { x: 0, y: Math.cos(radians), z: -Math.sin(radians) },
  };
};

const dot = (a: XrVector, b: XrVector): number => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a: XrVector): number => Math.hypot(a.x, a.y, a.z);

const expectVector = (actual: XrVector, expected: XrVector): void => {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.z).toBeCloseTo(expected.z, 6);
};

test("rests below the eyes at the full viewing distance", () => {
  const pose = hudPose(EYE, LEVEL.forward, LEVEL.up);
  expect(pose.position.y).toBeCloseTo(EYE.y - HUD_DISTANCE * Math.sin(HUD_PITCH_RADIANS), 6);
  expect(
    length({
      x: pose.position.x - EYE.x,
      y: pose.position.y - EYE.y,
      z: pose.position.z - EYE.z,
    }),
  ).toBeCloseTo(HUD_DISTANCE, 6);
});

test("ignores head pitch while following yaw", () => {
  const level = hudPose(EYE, LEVEL.forward, LEVEL.up);
  for (const degrees of [-40, -20, 15, 55]) {
    const head = pitchedHead(degrees);
    expect(hudPose(EYE, head.forward, head.up)).toEqual(level);
  }
  expect(hudPose(EYE, { x: 1, y: 0, z: 0 }, LEVEL.up).position.x).toBeGreaterThan(EYE.x);
});

test("keeps yaw at the straight-up and straight-down degeneracy", () => {
  expectVector(yawDirection({ x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }), {
    x: 0,
    y: 0,
    z: 1,
  });
  expectVector(yawDirection({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }), {
    x: 0,
    y: 0,
    z: 1,
  });
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
  expect(pose.look.x).toBeCloseTo(toEye.x / HUD_DISTANCE, 6);
  expect(pose.look.y).toBeCloseTo(toEye.y / HUD_DISTANCE, 6);
  expect(pose.look.z).toBeCloseTo(toEye.z / HUD_DISTANCE, 6);
  expect(dot(pose.look, pose.up)).toBeCloseTo(0, 6);
});
