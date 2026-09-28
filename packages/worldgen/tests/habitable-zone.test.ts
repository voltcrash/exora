import { expect, test } from "vite-plus/test";
import {
  deriveHabitableZone,
  habitableZonePlacement,
  isWithinHabitableZone,
} from "../src/index.ts";

const sun = { hostLuminosityLogSolar: 0, hostRadiusSolar: 1, hostTemperatureKelvin: 5_772 };

test("reproduces the published solar habitable zone", () => {
  const zone = deriveHabitableZone(sun);

  expect(zone).not.toBeNull();
  expect(zone?.optimisticInnerAu).toBeCloseTo(0.75, 2);
  expect(zone?.conservativeInnerAu).toBeCloseTo(0.95, 2);
  expect(zone?.conservativeOuterAu).toBeCloseTo(1.676, 2);
  expect(zone?.optimisticOuterAu).toBeCloseTo(1.768, 2);
  expect(zone?.luminositySource).toBe("measured");
  expect(zone?.extrapolated).toBe(false);
});

test("places the Solar System planets on the right side of each limit", () => {
  const zone = deriveHabitableZone(sun);
  if (!zone) throw new Error("Expected a solar habitable zone.");

  expect(habitableZonePlacement(zone, 0.387)).toBe("too-hot");
  expect(habitableZonePlacement(zone, 0.723)).toBe("too-hot");
  expect(habitableZonePlacement(zone, 1)).toBe("conservative");
  expect(habitableZonePlacement(zone, 1.524)).toBe("conservative");
  expect(habitableZonePlacement(zone, 5.2)).toBe("too-cold");
  expect(habitableZonePlacement(zone, 0.8)).toBe("optimistic-inner");
  expect(habitableZonePlacement(zone, 1.72)).toBe("optimistic-outer");
  expect(isWithinHabitableZone("optimistic-outer")).toBe(true);
  expect(isWithinHabitableZone("too-cold")).toBe(false);
});

test("puts TRAPPIST-1 e, f, and g inside a cool dwarf's close-in zone", () => {
  const zone = deriveHabitableZone({
    hostLuminosityLogSolar: -3.26,
    hostRadiusSolar: 0.12,
    hostTemperatureKelvin: 2_566,
  });
  if (!zone) throw new Error("Expected a TRAPPIST-1 habitable zone.");

  expect(zone.extrapolated).toBe(true);
  expect(habitableZonePlacement(zone, 0.0154)).toBe("too-hot");
  for (const axis of [0.0293, 0.0385, 0.0469]) {
    expect(isWithinHabitableZone(habitableZonePlacement(zone, axis))).toBe(true);
  }
  expect(habitableZonePlacement(zone, 0.0619)).toBe("too-cold");
});

test("derives luminosity from radius and temperature when none was measured", () => {
  const zone = deriveHabitableZone({ ...sun, hostLuminosityLogSolar: null });

  expect(zone?.luminositySource).toBe("derived");
  expect(zone?.luminositySolar).toBeCloseTo(1, 3);
  expect(zone?.conservativeInnerAu).toBeCloseTo(0.95, 2);
});

test("reports no zone when the catalog lacks what the fit needs", () => {
  expect(deriveHabitableZone({ ...sun, hostTemperatureKelvin: null })).toBeNull();
  expect(
    deriveHabitableZone({ ...sun, hostLuminosityLogSolar: null, hostRadiusSolar: null }),
  ).toBeNull();
  expect(deriveHabitableZone({ ...sun, hostTemperatureKelvin: 30_000 })).toBeNull();
  expect(
    deriveHabitableZone({ ...sun, hostLuminosityLogSolar: Number.NaN, hostRadiusSolar: null }),
  ).toBeNull();
  expect(
    deriveHabitableZone({ ...sun, hostLuminosityLogSolar: Number.NaN })?.luminositySource,
  ).toBe("derived");
});
