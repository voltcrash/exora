import { executeTerrainJob, type TerrainRequest, type TerrainResult } from "./terrain-jobs.ts";

export const runTerrainJob = async (
  request: TerrainRequest,
  signal?: AbortSignal,
): Promise<TerrainResult | null> => {
  if (signal?.aborted) return Promise.resolve(null);
  if (typeof Worker === "undefined") return Promise.resolve(executeTerrainJob(request));

  return new Promise((resolve, reject) => {
    let worker: Worker | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const finish = (result: TerrainResult | null, failure?: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
      worker?.terminate();
      if (failure !== undefined) reject(failure);
      else resolve(result);
    };
    const cancel = (): void => finish(null);
    const fallback = (): void => {
      if (settled) return;
      if (signal?.aborted) return cancel();
      worker?.terminate();
      worker = undefined;
      try {
        finish(executeTerrainJob(request));
      } catch (error) {
        finish(null, error);
      }
    };

    signal?.addEventListener("abort", cancel, { once: true });
    try {
      worker = new Worker(new URL("./terrain.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<unknown>) => {
        const result = event.data as Partial<TerrainResult> | null;
        if (!result || result.kind !== request.kind) return fallback();
        if (result.kind === "planet") {
          if (
            !(
              result.positions instanceof Float32Array || result.positions instanceof Float64Array
            ) ||
            request.kind !== "planet" ||
            result.positions.length !== request.positions.length
          )
            return fallback();
        } else if (result.kind === "surface" && request.kind === "surface") {
          const data = result.data;
          const vertices = (request.input.resolution + 1) ** 2;
          if (
            !data ||
            !Number.isFinite(data.low) ||
            !Number.isFinite(data.high) ||
            data.positions?.length !== vertices * 3 ||
            data.colors?.length !== vertices * 4 ||
            data.shade?.length !== vertices * 2 ||
            data.heights?.length !== vertices ||
            data.occlusion?.length !== vertices ||
            data.visibility?.length !== vertices ||
            data.indices?.length !== request.input.resolution ** 2 * 6 ||
            ![
              data.positions,
              data.colors,
              data.shade,
              data.heights,
              data.occlusion,
              data.visibility,
            ].every((value) => value instanceof Float32Array) ||
            !(data.indices instanceof Uint32Array)
          )
            return fallback();
        }
        finish(result as TerrainResult);
      };
      worker.onerror = (event) => {
        event.preventDefault();
        fallback();
      };
      worker.onmessageerror = fallback;
      timeout = setTimeout(fallback, 30_000);
      // Keep the input intact so a failed worker can retry the identical computation locally.
      worker.postMessage(request);
    } catch {
      fallback();
    }
  });
};
