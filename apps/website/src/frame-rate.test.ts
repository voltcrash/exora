import { expect, test } from "vite-plus/test";
import { frameRateStrength } from "./frame-rate.ts";

test("maps frame-rate readings to signal strength", () => {
  const readings = {
    "144": 4,
    "60": 4,
    "57": 4,
    "55": 4,
    "54": 3,
    "40": 3,
    "39": 2,
    "25": 2,
    "24": 1,
    "3": 1,
    "0": 1,
    "--": 0,
    "": 0,
    NaN: 0,
  } as const;

  for (const [reading, strength] of Object.entries(readings)) {
    expect(frameRateStrength(reading), reading).toBe(strength);
  }
});
