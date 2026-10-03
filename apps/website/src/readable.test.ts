import { expect, test } from "vite-plus/test";
import { readable, readableUnit } from "./readable.ts";

test("capitals come down to sentence case", () => {
  expect(readable("ORBIT FULLY MEASURED")).toBe("Orbit fully measured");
  expect(readable("NO CONFIRMED WORLDS LINKED")).toBe("No confirmed worlds linked");
});

test("each clause between separators starts with a capital", () => {
  expect(readable("SIZE FROM MASS · SHAPE ASSUMED CIRCULAR")).toBe(
    "Size from mass · Shape assumed circular",
  );
});

test("acronyms, units and designations keep their capitals", () => {
  expect(readable("JPL MEAN ORBITS · LOG-COMPRESSED DISTANCE")).toBe(
    "JPL mean orbits · Log-compressed distance",
  );
  expect(readable("NAIF 599 · SPK 2000001")).toBe("NAIF 599 · SPK 2000001");
  expect(readable("TRAPPIST-1 E")).toBe("TRAPPIST-1 E");
});

test("anything already written in mixed case is left as it is", () => {
  expect(readable("Kepler-22 b")).toBe("Kepler-22 b");
  expect(readable("M87*")).toBe("M87*");
});

test("units are set the way they are conventionally written", () => {
  expect(readableUnit("KM")).toBe("km");
  expect(readableUnit("PC")).toBe("pc");
  expect(readableUnit("AU")).toBe("AU");
  expect(readableUnit("M☉")).toBe("M☉");
});

test("each clause is judged on its own", () => {
  expect(readable("r^0.4 · EARTH ×600")).toBe("r^0.4 · Earth ×600");
});

test("each part of a slashed word is judged on its own", () => {
  expect(readable("NASA/JPL")).toBe("NASA/JPL");
  expect(readable("HYDROGEN/HELIUM")).toBe("Hydrogen/helium");
});
