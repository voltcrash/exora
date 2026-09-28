import { expect, test } from "vite-plus/test";
import { deriveBlackHolePhysics, formatMagnitude } from "./black-hole-physics.ts";
import { findBlackHole } from "./black-holes.ts";

const physicsOf = (name: string) => {
  const blackHole = findBlackHole(name);
  if (!blackHole) throw new Error(`Expected the ${name} catalog landmark.`);
  return Object.fromEntries(deriveBlackHolePhysics(blackHole).map((fact) => [fact.label, fact]));
};

test("M87*'s derived shadow matches the ring the Event Horizon Telescope resolved", () => {
  const physics = physicsOf("M87*");

  expect(physics["Shadow from Earth"]).toMatchObject({ unit: "µas", value: "39.5" });
  expect(physics["Innermost stable orbit"]).toMatchObject({ unit: "AU", value: "385" });
  expect(physics["Innermost stable orbit"]?.detail).toContain("34.2 days");
  expect(physics["Mean density"]?.detail).toContain("thinner than the air");
  expect(physics["Horizon tides"]?.detail).toContain("cross it intact");
});

test("a stellar-mass hole spaghettifies far outside its horizon", () => {
  const physics = physicsOf("Cygnus X-1");

  expect(physics["Horizon tides"]).toMatchObject({ unit: "g", value: "4.7 × 10⁶" });
  expect(physics["Horizon tides"]?.detail).toContain("lethal from 4,860 km out");
  expect(physics["Hawking temperature"]).toMatchObject({ unit: "K", value: "2.9 × 10⁻⁹" });
});

test("a hole without a distance still reports what its mass alone decides", () => {
  const physics = physicsOf("TON 618");

  expect(physics["Shadow from Earth"]).toBeUndefined();
  expect(physics["Photon sphere"]).toBeDefined();
});

test("a hole without a mass reports nothing", () => {
  const blackHole = findBlackHole("M87*");
  if (!blackHole) throw new Error("Expected M87*.");
  expect(deriveBlackHolePhysics({ ...blackHole, massSolar: null })).toEqual([]);
});

test("magnitudes switch to scientific notation outside everyday ranges", () => {
  expect(formatMagnitude(0.436)).toBe("0.436");
  expect(formatMagnitude(123_456)).toBe("123,000");
  expect(formatMagnitude(4.72e6)).toBe("4.7 × 10⁶");
  expect(formatMagnitude(9.49e-18)).toBe("9.5 × 10⁻¹⁸");
});
