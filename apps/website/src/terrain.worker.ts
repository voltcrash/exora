import { executeTerrainJob, terrainTransfers, type TerrainRequest } from "./terrain-jobs.ts";

const scope = globalThis as unknown as {
  onmessage: (event: MessageEvent<TerrainRequest>) => void;
  postMessage: (result: unknown, transfer: ArrayBuffer[]) => void;
};

scope.onmessage = ({ data }) => {
  const result = executeTerrainJob(data);
  scope.postMessage(result, terrainTransfers(result));
};
