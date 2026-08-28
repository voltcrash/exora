import { expect, test } from "vite-plus/test";
import { advanceXrButtonPressGate, xrControllerAction } from "./xr-controller-input.ts";

test("ignores a trigger inherited from VR entry until it is released", () => {
  expect(advanceXrButtonPressGate(false, true)).toEqual({ activate: false, armed: false });
  expect(advanceXrButtonPressGate(false, false)).toEqual({ activate: false, armed: true });
  expect(advanceXrButtonPressGate(true, true)).toEqual({ activate: true, armed: false });
});

test("maps only controller input needed for immersive viewing", () => {
  expect(xrControllerAction("a-button")).toBe("primary");
  expect(xrControllerAction("x-button")).toBe("primary");
  expect(xrControllerAction("xr-standard-trigger")).toBe("immersive");
  expect(xrControllerAction("b-button")).toBeNull();
  expect(xrControllerAction("y-button")).toBeNull();
  expect(xrControllerAction("xr-standard-squeeze")).toBeNull();
  expect(xrControllerAction("menu")).toBeNull();
  expect(xrControllerAction("xr-standard-thumbstick")).toBeNull();
});
