import { edgeCached, type EdgeCache } from "./edge-cache.ts";
import { bundledPlanetCatalog } from "./planet-catalog-snapshot.ts";
import { createRuntimeApp } from "./runtime.ts";

interface WorkerContext {
  waitUntil(task: Promise<unknown>): void;
}

// Decode the bundled catalog while the isolate starts, which Workers budget separately, rather
// than inside the first planet request's CPU allowance.
bundledPlanetCatalog();

// Cloudflare overwrites cf-connecting-ip on every request, so callers cannot choose their budget.
const app = createRuntimeApp({ trustedClientIpHeader: "cf-connecting-ip" });

// Present on Workers; absent under Node and in tests, where responses are not edge cached.
const edgeCache = (): EdgeCache | undefined =>
  (globalThis.caches as { default?: EdgeCache } | undefined)?.default;

export default {
  fetch(request: Request, _env: unknown, context: WorkerContext): Promise<Response> {
    return edgeCached(
      request,
      (incoming) => app.fetch(incoming),
      edgeCache(),
      (task) => context.waitUntil(task),
    );
  },
};
