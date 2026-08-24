import { readFile } from "node:fs/promises";
import { expect, test, vi } from "vite-plus/test";
import { HorizonsError } from "../src/horizons.ts";
import {
  JplMissionTrajectoryRepository,
  MISSION_TRAJECTORY_TARGETS,
  parseMissionTrajectory,
} from "../src/mission-trajectories.ts";

const fixture = JSON.parse(
  await readFile(
    new URL("./fixtures/horizons-voyager-1-trajectory-v1.2.json", import.meta.url),
    "utf8",
  ),
) as unknown;
const voyager = MISSION_TRAJECTORY_TARGETS.find(({ spkId }) => spkId === "-31");
if (!voyager) throw new Error("Voyager 1 must be an allowlisted mission target.");

test("parses a versioned multi-point Horizons spacecraft trajectory", () => {
  const parsed = parseMissionTrajectory(fixture, voyager);

  expect(parsed.solution).toBe("Voyager_1_ST+refit2022_m");
  expect(parsed.points).toHaveLength(3);
  expect(parsed.points[0]).toEqual({
    calendarTdb: "A.D. 1977-Sep-06 00:00:00.0000 TDB",
    julianDateTdb: 2_443_392.5,
    positionAu: { x: 1.009057, y: -0.01206431, z: 0.0001166576 },
    velocityAuPerDay: { x: 0.01014413, y: 0.0211372, z: 0.001829566 },
  });
});

test("rejects target substitution and changed response envelopes", () => {
  expect(() => parseMissionTrajectory(fixture, MISSION_TRAJECTORY_TARGETS[0])).toThrow(
    /different mission/,
  );
  expect(() =>
    parseMissionTrajectory(
      { ...(fixture as object), signature: { source: "NASA/JPL Horizons API", version: "2" } },
      voyager,
    ),
  ).toThrow(HorizonsError);
});

test("coalesces and caches identical mission requests", async () => {
  const fetcher = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>(
    async () => Response.json(fixture),
  );
  const repository = new JplMissionTrajectoryRepository({ fetcher, now: () => 1_000 });

  const [first, concurrent] = await Promise.all([
    repository.trajectory("-31", "1977-09-06", "1979-09-06", 365),
    repository.trajectory("-31", "1977-09-06", "1979-09-06", 365),
  ]);
  const cached = await repository.trajectory("-31", "1977-09-06", "1979-09-06", 365);

  expect(fetcher).toHaveBeenCalledOnce();
  expect(first.value).toEqual(concurrent.value);
  expect(cached).toMatchObject({ cached: true, stale: false, target: { spkId: "-31" } });
  const requestedInput = fetcher.mock.calls[0]?.[0];
  if (!requestedInput) throw new Error("Expected a Horizons request URL.");
  const requested =
    requestedInput instanceof URL
      ? requestedInput
      : new URL(typeof requestedInput === "string" ? requestedInput : requestedInput.url);
  expect(requested.searchParams.get("CENTER")).toBe("'500@10'");
  expect(requested.searchParams.get("STEP_SIZE")).toBe("'365 d'");
});

test("serves an expired trajectory as stale when Horizons is unavailable", async () => {
  let now = 1_000;
  const fetcher = vi
    .fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>()
    .mockResolvedValueOnce(Response.json(fixture))
    .mockRejectedValueOnce(new Error("maintenance"));
  const repository = new JplMissionTrajectoryRepository({
    cacheTtlMs: 10,
    fetcher,
    now: () => now,
    staleTtlMs: 1_000,
  });
  await repository.trajectory("-31", "1977-09-06", "1979-09-06", 365);
  now = 1_020;

  await expect(
    repository.trajectory("-31", "1977-09-06", "1979-09-06", 365),
  ).resolves.toMatchObject({ cached: true, stale: true, value: expect.any(Array) });
});
