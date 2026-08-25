import { expect, test } from "vite-plus/test";
import { resolveXrEmulatorRequest } from "./xr-emulator.ts";

test("stays off without a request or stored preference", () => {
  expect(resolveXrEmulatorRequest("", "unset")).toEqual({
    enabled: false,
    headset: "quest2",
    persist: "unset",
    stereo: false,
  });
});

test("enables emulation from the query string", () => {
  expect(resolveXrEmulatorRequest("?xr=emulate", "unset")).toEqual({
    enabled: true,
    headset: "quest2",
    persist: "enabled",
    stereo: false,
  });
  expect(resolveXrEmulatorRequest("?planet=HIP+65426+b&xr=on", "unset").enabled).toBe(true);
});

test("renders both eyes when stereo is requested", () => {
  expect(resolveXrEmulatorRequest("?xr=stereo", "unset")).toEqual({
    enabled: true,
    headset: "quest2",
    persist: "enabled",
    stereo: true,
  });
  expect(resolveXrEmulatorRequest("?stereo", "unset").stereo).toBe(true);
});

test("keeps emulating across navigations once stored", () => {
  expect(resolveXrEmulatorRequest("", "enabled").enabled).toBe(true);
  expect(resolveXrEmulatorRequest("", "disabled").enabled).toBe(false);
});

test("returns to the native runtime on request", () => {
  expect(resolveXrEmulatorRequest("?xr=off", "enabled")).toEqual({
    enabled: false,
    headset: "quest2",
    persist: "disabled",
    stereo: false,
  });
});

test("emulates the newer headset only when it is asked for", () => {
  expect(resolveXrEmulatorRequest("?xr=emulate", "unset").headset).toBe("quest2");
  expect(resolveXrEmulatorRequest("?xr=quest3", "unset")).toEqual({
    enabled: true,
    headset: "quest3",
    persist: "enabled",
    stereo: false,
  });
});
