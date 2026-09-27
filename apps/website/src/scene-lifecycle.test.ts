import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { expect, test } from "vite-plus/test";
import { fieldOfViewModeFor } from "./scene-lifecycle.ts";

test("portrait viewports hold the horizontal angle so subjects fit across", () => {
  expect(fieldOfViewModeFor(390, 844)).toBe(Camera.FOVMODE_HORIZONTAL_FIXED);
});

test("landscape and square viewports keep Babylon's vertical angle", () => {
  expect(fieldOfViewModeFor(1280, 800)).toBe(Camera.FOVMODE_VERTICAL_FIXED);
  expect(fieldOfViewModeFor(800, 800)).toBe(Camera.FOVMODE_VERTICAL_FIXED);
});

test("an unmeasured canvas falls back to the vertical angle", () => {
  expect(fieldOfViewModeFor(0, 0)).toBe(Camera.FOVMODE_VERTICAL_FIXED);
});
