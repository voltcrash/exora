import { expect, test } from "vite-plus/test";
import { advanceXrButtonPressGate, xrControllerAction } from "./xr-controller-input.ts";

test("ignores a trigger inherited from VR entry until it is released", () => {
  expect(advanceXrButtonPressGate(false, true)).toEqual({ activate: false, armed: false });
  expect(advanceXrButtonPressGate(false, false)).toEqual({ activate: false, armed: true });
  expect(advanceXrButtonPressGate(true, true)).toEqual({ activate: true, armed: false });
});

test("maps Quest face buttons, grips, triggers, and the left application menu control", () => {
  expect(xrControllerAction("a-button")).toBe("primary");
  expect(xrControllerAction("x-button")).toBe("primary");
  expect(xrControllerAction("b-button")).toBe("back");
  expect(xrControllerAction("y-button")).toBe("back");
  expect(xrControllerAction("xr-standard-squeeze")).toBe("discover");
  expect(xrControllerAction("xr-standard-trigger")).toBe("immersive");
  expect(xrControllerAction("menu", "left")).toBe("discover");
  expect(xrControllerAction("menu", "right")).toBeNull();
  expect(xrControllerAction("xr-standard-thumbstick")).toBeNull();
});
