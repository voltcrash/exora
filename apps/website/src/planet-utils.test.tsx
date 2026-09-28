import { expect, test } from "vite-plus/test";
import { formatMeasurement, formatTimescale } from "./planet-utils.tsx";

test("does not round small non-zero measurements to zero", () => {
  expect(formatMeasurement(0.00398)).toBe("0.00398");
  expect(formatMeasurement(0.04856, 1)).toBe("0.0486");
});

test("keeps ordinary measurements compact", () => {
  expect(formatMeasurement(1.301, 1)).toBe("1.3");
  expect(formatMeasurement(0, 1)).toBe("0");
  expect(formatMeasurement(null, 1)).toBe("—");
});

test("states timescales in words at two significant figures", () => {
  expect(formatTimescale(0.2)).toBe("under a year");
  expect(formatTimescale(540)).toBe("540 years");
  expect(formatTimescale(13_400)).toBe("13 thousand years");
  expect(formatTimescale(4.6e9)).toBe("4.6 billion years");
  expect(formatTimescale(2.1e11)).toBe("210 billion years");
  expect(formatTimescale(3e17)).toBe("10^17 years");
});
