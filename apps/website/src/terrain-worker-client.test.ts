import { afterEach, expect, test, vi } from "vite-plus/test";
import { EARTH, MARS, MERCURY, VENUS } from "./solar-system.ts";
import { planetTerrainFixture, surfaceTerrainFixture } from "./terrain-test-fixtures.ts";
import {
  executeTerrainJob,
  terrainTransfers,
  type TerrainRequest,
  type TerrainResult,
} from "./terrain-jobs.ts";
import { runTerrainJob } from "./terrain-worker-client.ts";

class PendingWorker {
  static instances: PendingWorker[] = [];
  onmessage?: (event: { data: TerrainResult }) => void;
  onerror?: (event: { preventDefault: () => void }) => void;
  onmessageerror?: () => void;
  terminate = vi.fn();
  postMessage = vi.fn<(request: TerrainRequest) => void>();
  constructor() {
    PendingWorker.instances.push(this);
  }
}

const pendingWorker = () => {
  vi.stubGlobal("Worker", PendingWorker);
  const task = runTerrainJob(planetTerrainFixture(MARS));
  return { task, worker: PendingWorker.instances.at(-1)! };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  PendingWorker.instances = [];
});

test.each([EARTH, MARS, MERCURY, VENUS])(
  "$name fallback preserves every result byte and transfers all output arrays",
  async (planet) => {
    vi.stubGlobal("Worker", undefined);
    for (const request of [
      planetTerrainFixture(planet),
      planetTerrainFixture(planet, true),
      surfaceTerrainFixture(planet),
    ]) {
      const expected = executeTerrainJob(structuredClone(request));
      const actual = await runTerrainJob(structuredClone(request));
      expect(actual).toEqual(expected);
      const buffers = terrainTransfers(actual!);
      const transferred = structuredClone(actual!, { transfer: buffers });
      expect(buffers.every((buffer) => buffer.byteLength === 0)).toBe(true);
      expect(transferred).toEqual(expected);
    }
  },
);

test("worker startup failures retry synchronously", async () => {
  vi.stubGlobal(
    "Worker",
    class {
      constructor() {
        throw new Error("blocked");
      }
    },
  );
  const input = planetTerrainFixture(MARS);
  expect(await runTerrainJob(input)).toEqual(executeTerrainJob(planetTerrainFixture(MARS)));
});

test.each(["onerror", "onmessageerror"] as const)(
  "%s retries from the intact input and terminates the worker",
  async (event) => {
    const { task, worker } = pendingWorker();
    if (event === "onerror") worker.onerror!({ preventDefault: vi.fn() });
    else worker.onmessageerror!();
    expect(await task).toEqual(executeTerrainJob(planetTerrainFixture(MARS)));
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.postMessage.mock.calls[0]![0]).toMatchObject({ kind: "planet" });
  },
);

test("an unresponsive worker times out and falls back", async () => {
  vi.useFakeTimers();
  const { task, worker } = pendingWorker();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(await task).toEqual(executeTerrainJob(planetTerrainFixture(MARS)));
  expect(worker.terminate).toHaveBeenCalledOnce();
});

test("cancellation terminates pending work and ignores a late result", async () => {
  vi.stubGlobal("Worker", PendingWorker);
  const controller = new AbortController();
  const task = runTerrainJob(planetTerrainFixture(MARS), controller.signal);
  const worker = PendingWorker.instances[0]!;
  controller.abort();
  worker.onmessage!({ data: executeTerrainJob(planetTerrainFixture(MARS)) });
  expect(await task).toBeNull();
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(await runTerrainJob(planetTerrainFixture(MARS), controller.signal)).toBeNull();
  expect(PendingWorker.instances).toHaveLength(1);
});

test("a kernel failure rejects consistently rather than reporting a cancelled job", async () => {
  const input = planetTerrainFixture(MARS);
  if (input.kind !== "planet") throw new Error("Expected planet input.");
  Object.defineProperty(input.recipe, "terrain", {
    get: () => {
      throw new Error("invalid terrain");
    },
  });
  vi.stubGlobal("Worker", undefined);
  await expect(runTerrainJob(input)).rejects.toThrow("invalid terrain");
  vi.stubGlobal("Worker", PendingWorker);
  const task = runTerrainJob(input);
  PendingWorker.instances.at(-1)!.onmessageerror!();
  await expect(task).rejects.toThrow("invalid terrain");
});

test("a malformed worker result falls back instead of entering the scene", async () => {
  const { task, worker } = pendingWorker();
  worker.onmessage!({ data: { kind: "planet", positions: new Float32Array(1) } });
  expect(await task).toEqual(executeTerrainJob(planetTerrainFixture(MARS)));
  expect(worker.terminate).toHaveBeenCalledOnce();
});
