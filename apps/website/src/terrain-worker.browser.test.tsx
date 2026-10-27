import { expect, test } from "vite-plus/test";
import { EARTH, MARS, MERCURY, VENUS } from "./solar-system.ts";
import { planetTerrainFixture, surfaceTerrainFixture } from "./terrain-test-fixtures.ts";
import {
  executeTerrainJob,
  terrainTransfers,
  type TerrainRequest,
  type TerrainResult,
} from "./terrain-jobs.ts";

const workerResult = (request: TerrainRequest): Promise<TerrainResult> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./terrain.worker.ts", import.meta.url), { type: "module" });
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error("Worker timed out."));
    }, 10_000);
    worker.onmessage = ({ data }: MessageEvent<TerrainResult>) => {
      clearTimeout(timeout);
      worker.terminate();
      resolve(data);
    };
    worker.onerror = (event) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(new Error(event.message));
    };
    worker.postMessage(request);
  });

const expectIdentical = (actual: TerrainResult, expected: TerrainResult) => {
  expect(actual.kind).toBe(expected.kind);
  const received = terrainTransfers(actual);
  const reference = terrainTransfers(expected);
  expect(received.length).toBe(reference.length);
  for (let index = 0; index < reference.length; index += 1) {
    const left = new Uint8Array(received[index]!);
    const right = new Uint8Array(reference[index]!);
    expect(left.length).toBe(right.length);
    expect(left.every((value, byte) => value === right[byte])).toBe(true);
  }
  if (actual.kind === "surface" && expected.kind === "surface") {
    expect(actual.data.low).toBe(expected.data.low);
    expect(actual.data.high).toBe(expected.data.high);
  }
};

test.each([EARTH, MARS, MERCURY, VENUS])(
  "$name module worker returns bit-identical planet and surface arrays",
  async (planet) => {
    for (const request of [
      planetTerrainFixture(planet),
      planetTerrainFixture(planet, true),
      surfaceTerrainFixture(planet),
    ]) {
      const actual = await workerResult(request);
      const expected = executeTerrainJob(structuredClone(request));
      expectIdentical(actual, expected);
    }
  },
);

test("desktop surface bake measures synchronous work and worker dispatch separately", async () => {
  const input = surfaceTerrainFixture(MARS, 208);
  const syncStart = performance.now();
  const expected = executeTerrainJob(structuredClone(input));
  const syncMs = performance.now() - syncStart;
  const workerStart = performance.now();
  const task = workerResult(input);
  const dispatchMs = performance.now() - workerStart;
  const actual = await task;
  const wallMs = performance.now() - workerStart;
  expectIdentical(actual, expected);
  console.log(
    `[terrain] Mars 208: sync main thread ${syncMs.toFixed(2)} ms; worker dispatch main thread ${dispatchMs.toFixed(2)} ms; worker wall ${wallMs.toFixed(2)} ms`,
  );
});
