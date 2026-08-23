import { describe, expect, it } from "vite-plus/test";
import { findSolarStar, SOLAR_SYSTEM_CATALOG, SUN } from "./solar-system.ts";

describe("the local Solar System catalog", () => {
  it("starts with the Sun under its permanent JPL identity", () => {
    expect(SOLAR_SYSTEM_CATALOG).toEqual([{ profile: SUN, type: "star" }]);
    expect(SUN.solarSystem).toMatchObject({ bodyType: "star", naifId: 10, parent: null });
    expect(SUN.source.archive).toBe("NASA/JPL Solar System Dynamics");
  });

  it("resolves the Sun without depending on SIMBAD", () => {
    expect(findSolarStar(" sun ")).toBe(SUN);
    expect(findSolarStar("Sol")).toBeNull();
  });
});
