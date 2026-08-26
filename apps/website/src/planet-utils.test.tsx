import { expect, test } from "vite-plus/test";
import { formatMeasurement } from "./planet-utils.tsx";

test("does not round small non-zero measurements to zero", () => {
  expect(formatMeasurement(0.00398)).toBe("0.00398");
  expect(formatMeasurement(0.04856, 1)).toBe("0.0486");
});

test("keeps ordinary measurements compact", () => {
  expect(formatMeasurement(1.301, 1)).toBe("1.3");
  expect(formatMeasurement(0, 1)).toBe("0");
  expect(formatMeasurement(null, 1)).toBe("—");
});
