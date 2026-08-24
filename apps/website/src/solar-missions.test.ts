import { expect, test } from "vite-plus/test";
import { findSolarMission, SOLAR_SYSTEM_MISSIONS } from "./solar-missions.ts";

test("covers every requested trajectory and exploration-site collection", () => {
  expect(SOLAR_SYSTEM_MISSIONS.map(({ name }) => name)).toEqual([
    "Voyager 1",
    "Voyager 2",
    "Pioneer 10",
    "Pioneer 11",
    "New Horizons",
    "Parker Solar Probe",
    "Juno",
    "Cassini",
    "Galileo",
    "Dawn",
    "Rosetta",
    "OSIRIS-REx",
    "Apollo landing sites",
    "Mars landers and rovers",
  ]);
  expect(SOLAR_SYSTEM_MISSIONS.filter(({ kind }) => kind === "trajectory")).toHaveLength(12);
});

test("keeps permanent IDs, sources, and bounded trajectory requests on every mission", () => {
  for (const mission of SOLAR_SYSTEM_MISSIONS) {
    expect(mission.sources.length).toBeGreaterThan(0);
    expect(mission.sources.every(({ url }) => url.startsWith("https://"))).toBe(true);
    if (mission.kind === "trajectory") {
      expect(mission.spkId).toMatch(/^-\d+$/);
      const days =
        (Date.parse(mission.trajectory.stop) - Date.parse(mission.trajectory.start)) / 86_400_000;
      expect(Math.ceil(days / mission.trajectory.stepDays) + 1).toBeLessThanOrEqual(400);
    } else {
      expect(mission.sites.length).toBeGreaterThanOrEqual(6);
      expect(mission.sites.every(({ latitudeDegrees }) => Math.abs(latitudeDegrees) <= 90)).toBe(
        true,
      );
      expect(
        mission.sites.every(({ longitudeDegreesEast }) => Math.abs(longitudeDegreesEast) <= 180),
      ).toBe(true);
    }
  }
});

test("resolves mission names, aliases, and spacecraft SPK IDs", () => {
  expect(findSolarMission("Voyager-1")?.name).toBe("Voyager 1");
  expect(findSolarMission("-98")?.name).toBe("New Horizons");
  expect(findSolarMission("Mars landing sites")?.name).toBe("Mars landers and rovers");
  expect(findSolarMission("not a mission")).toBeNull();
});
