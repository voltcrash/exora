import { expect, test } from "vite-plus/test";
import {
  HUD_DISTANCE,
  HUD_FILL_OVERSCAN,
  hudPose,
  hudProjectionFillScale,
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

test("rests on the optical axis at the full viewing distance", () => {
  const pose = hudPose(EYE, LEVEL.forward, LEVEL.up);

  expect(pose.position.y).toBeCloseTo(EYE.y, 6);
  const offset = {
    x: pose.position.x - EYE.x,
    y: pose.position.y - EYE.y,
    z: pose.position.z - EYE.z,
  };
  expect(length(offset)).toBeCloseTo(HUD_DISTANCE, 6);
});

test("follows head pitch so the full-screen surface stays in view", () => {
  for (const degrees of [-40, -20, 15, 55]) {
    const head = pitchedHead(degrees);
    const pose = hudPose(EYE, head.forward, head.up);
    expect(pose.position.y).toBeCloseTo(
      EYE.y + HUD_DISTANCE * Math.sin((degrees * Math.PI) / 180),
      6,
    );
  }
});

test("follows head yaw", () => {
  const pose = hudPose(EYE, { x: 1, y: 0, z: 0 }, LEVEL.up);

  expect(pose.position.x).toBeCloseTo(EYE.x + HUD_DISTANCE, 6);
  expect(pose.position.z).toBeCloseTo(EYE.z, 6);
});

test("follows the wearer rather than being left behind", () => {
  const walked = { x: 12, y: 1.42, z: -7 };
  const pose = hudPose(walked, LEVEL.forward, LEVEL.up);

  expect(pose.position.x).toBeCloseTo(walked.x, 6);
  expect(pose.position.z).toBeCloseTo(walked.z + HUD_DISTANCE, 6);
});

test("falls back to a usable direction rather than a NaN transform", () => {
  const pose = hudPose(EYE, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });

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

test("produces a level head-on panel for a level gaze", () => {
  const pose = hudPose(EYE, LEVEL.forward, LEVEL.up, HUD_DISTANCE);

  expectVector(pose.position, { x: 0, y: EYE.y, z: HUD_DISTANCE });
  expectVector(pose.look, { x: 0, y: 0, z: -1 });
  expectVector(pose.up, { x: 0, y: 1, z: 0 });
});

test("scales the panel to fill the headset projection", () => {
  const aspect = 16 / 10;
  const projection = [1 / aspect, 0, 0, 0, 0, 1];
  const panel = { height: 1.7, width: 2.72 };
  const scale = hudProjectionFillScale(projection, panel.width, panel.height);

  expect(scale.x).toBeCloseTo(((2 * HUD_DISTANCE * aspect) / panel.width) * HUD_FILL_OVERSCAN, 6);
  expect(scale.y).toBeCloseTo(((2 * HUD_DISTANCE) / panel.height) * HUD_FILL_OVERSCAN, 6);
  expect(panel.width * scale.x).toBeGreaterThanOrEqual(2 * HUD_DISTANCE * aspect);
  expect(panel.height * scale.y).toBeGreaterThanOrEqual(2 * HUD_DISTANCE);
});

test("uses the wider projection axis and safely ignores invalid matrices", () => {
  const wideProjection = [0.5, 0, 0, 0, 0, 1];
  const scale = hudProjectionFillScale(wideProjection, 2.72, 1.7, HUD_DISTANCE, 1);

  expect(scale.x).toBeCloseTo((2 * HUD_DISTANCE) / 0.5 / 2.72, 6);
  expect(scale.y).toBeCloseTo((2 * HUD_DISTANCE) / 1.7, 6);
  expect(hudProjectionFillScale([], 2.72, 1.7)).toEqual({ x: 1, y: 1 });
  expect(hudProjectionFillScale(wideProjection, 0, 1.7)).toEqual({ x: 1, y: 1 });
});
