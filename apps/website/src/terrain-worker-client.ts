import { executeTerrainJob, type TerrainRequest, type TerrainResult } from "./terrain-jobs.ts";

export const runTerrainJob = (
  request: TerrainRequest,
  signal?: AbortSignal,
): Promise<TerrainResult | null> => {
  if (signal?.aborted) return Promise.resolve(null);
  if (typeof Worker === "undefined") return Promise.resolve(executeTerrainJob(request));

  return new Promise((resolve, reject) => {
    let worker: Worker | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const finish = (result: TerrainResult | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
      worker?.terminate();
      resolve(result);
    };
    const cancel = (): void => finish(null);
    const fallback = (): void => {
      if (settled) return;
      if (signal?.aborted) return cancel();
      try {
        finish(executeTerrainJob(request));
      } catch (error) {
        finish(null);
        reject(error);
      }
    };

    signal?.addEventListener("abort", cancel, { once: true });
    try {
      worker = new Worker(new URL("./terrain.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<TerrainResult>) => finish(event.data);
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
