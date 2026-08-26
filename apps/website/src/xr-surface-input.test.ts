import { expect, test } from "vite-plus/test";
import {
  rangeValueAtClientX,
  texturePointToClient,
  xrControllerAction,
} from "./xr-surface-input.ts";

const rect = { height: 900, left: 24, top: 16, width: 1440 };

test("maps the texture corners into the desktop dialog", () => {
  expect(texturePointToClient(0, 1, rect)).toEqual({ x: 24, y: 16 });
  expect(texturePointToClient(1, 0, rect)).toEqual({ x: 1464, y: 916 });
  expect(texturePointToClient(0.5, 0.5, rect)).toEqual({ x: 744, y: 466 });
});

test("clamps hits at the panel edge", () => {
  expect(texturePointToClient(-0.2, 1.4, rect)).toEqual({ x: 24, y: 16 });
  expect(texturePointToClient(1.2, -0.4, rect)).toEqual({ x: 1464, y: 916 });
});

test("selects stepped range values using the desktop control geometry", () => {
  expect(rangeValueAtClientX(75, { left: 50, width: 100 }, 0, 10, 2)).toBe(2);
  expect(rangeValueAtClientX(101, { left: 50, width: 100 }, 0, 10, 2)).toBe(6);
  expect(rangeValueAtClientX(200, { left: 50, width: 100 }, 0, 10, 2)).toBe(10);
});

test("maps Quest face buttons, grips, triggers, and application menu controls", () => {
  expect(xrControllerAction("a-button")).toBe("primary");
  expect(xrControllerAction("x-button")).toBe("primary");
  expect(xrControllerAction("b-button")).toBe("back");
  expect(xrControllerAction("y-button")).toBe("back");
  expect(xrControllerAction("xr-standard-squeeze")).toBe("selection");
  expect(xrControllerAction("xr-standard-trigger")).toBe("menu");
  expect(xrControllerAction("menu")).toBe("menu");
  expect(xrControllerAction("xr-standard-thumbstick")).toBeNull();
});
