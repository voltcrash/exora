import { expect, test } from "vite-plus/test";
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
      expect(error, `${body.name} at ${date.toISOString()}`).toBeLessThan(0.01);
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
