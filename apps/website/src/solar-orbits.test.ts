import { expect, test } from "vite-plus/test";
import bodies from "./data/solar-orbits.json";
import fixtures from "./data/solar-orbits-fixtures.json";
import { solarPositionsAt } from "./solar-orbits.ts";

test("all thirteen local orbits agree with independently dated Horizons fixtures", () => {
  let worst = { au: 0, name: "", jd: 0 };
  expect(fixtures).toHaveLength(13);
  for (const body of fixtures) {
    for (const state of body.states) {
      const [jd, x, y, z] = state as [number, number, number, number];
      const date = new Date((jd - 2_440_587.5) * 86_400_000);
      const actual = solarPositionsAt(date).find((value) => value.naifId === body.naifId)!;
      expect(actual.provenance).toBe("derived");
      const error = Math.hypot(
        actual.positionAu.x - x,
        actual.positionAu.y - y,
        actual.positionAu.z - z,
      );
      if (error > worst.au) worst = { au: error, name: body.name, jd };
      expect(error, `${body.name} at ${date.toISOString()}`).toBeLessThan(0.0005);
    }
  }
  console.log("Worst sampled position error", worst);
});

test("rejects dates outside the supported UTC range", () => {
  for (const date of [new Date(NaN), new Date("1899-12-31"), new Date("2101-01-01")]) {
    expect(() => solarPositionsAt(date)).toThrow(RangeError);
  }
  expect(solarPositionsAt(new Date("2100-12-31T23:59:59.999Z"))).toHaveLength(13);
});

test("bundled states bracket the validity range on a uniform grid", () => {
  for (const body of bodies) {
    expect(body.states[0]![0]!).toBeLessThan(2_415_020.5);
    expect(body.states.at(-1)![0]!).toBeGreaterThan(2_488_434.5);
    for (let i = 1; i < body.states.length; i += 1) {
      expect(body.states[i]![0]! - body.states[i - 1]![0]!).toBe(365);
      expect(body.states[i]).toHaveLength(7);
    }
  }
});

test("playback crosses an annual anchor without a position jump", () => {
  const time = (bodies[0]!.states[100]![0]! - 2_440_587.5) * 86_400_000;
  const before = solarPositionsAt(new Date(time - 1));
  const after = solarPositionsAt(new Date(time + 1));
  for (let i = 0; i < before.length; i += 1) {
    const a = before[i]!.positionAu;
    const b = after[i]!.positionAu;
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(1e-8);
  }
});
