import { expect, test } from "vite-plus/test";
import { frameRateStrength } from "./frame-rate.ts";

test("a scene running at the refresh rate fills the meter", () => {
  expect(frameRateStrength("60")).toBe(4);
  expect(frameRateStrength("144")).toBe(4);
});

test("a panel that never quite reports its own rate still fills it", () => {
  expect(frameRateStrength("57")).toBe(4);
  expect(frameRateStrength("55")).toBe(4);
});

test("the bars fall with the frame rate", () => {
  expect(frameRateStrength("54")).toBe(3);
  expect(frameRateStrength("40")).toBe(3);
  expect(frameRateStrength("39")).toBe(2);
  expect(frameRateStrength("25")).toBe(2);
  expect(frameRateStrength("24")).toBe(1);
  expect(frameRateStrength("3")).toBe(1);
});

test("a stalled renderer is one bar, not an empty meter", () => {
  expect(frameRateStrength("0")).toBe(1);
});

test("nothing measured yet lights nothing", () => {
  expect(frameRateStrength("--")).toBe(0);
  expect(frameRateStrength("")).toBe(0);
  expect(frameRateStrength("NaN")).toBe(0);
});
