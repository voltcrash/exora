import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { expect, test } from "vite-plus/test";

type Listener = (event: FakeEvent) => void;

// Node's Request refuses the "navigate" mode a browser gives page loads, so tests describe one.
interface NavigationRequest {
  method: "GET";
  mode: "navigate";
  url: string;
}

interface FakeEvent {
  request?: Request | NavigationRequest;
  respondWith?: (response: Promise<Response>) => void;
  waitUntil: (promise: Promise<unknown>) => void;
}

const createWorker = async (network: (request: Request) => Promise<Response>) => {
  const source = new TextDecoder().decode(
    await readFile(new URL("../public/sw.js", import.meta.url)),
  );
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (request: NavigationRequest | Request | string): string =>
    typeof request === "string" ? new URL(request, "https://exora.test").href : request.url;
  const caches = {
    delete: async (name: string) => stores.delete(name),
    keys: async () => [...stores.keys()],
    match: async (request: NavigationRequest | Request | string) => {
      for (const store of stores.values()) {
        const hit = store.get(keyOf(request));
        if (hit) return hit.clone();
      }
      return undefined;
    },
    open: async (name: string) => {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return {
        addAll: async (urls: string[]) => {
          for (const url of urls) store.set(keyOf(url), new Response(`shell ${url}`));
        },
        delete: async (request: Request | string) => store.delete(keyOf(request)),
        keys: async () => [...store.keys()],
        put: async (request: Request | string, response: Response) => {
          store.set(keyOf(request), response);
        },
      };
    },
  };
  const listeners = new Map<string, Listener>();
  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    clients: { claim: async () => undefined },
    exoraRouteFor: undefined as unknown as (pathname: string, mode: string) => string | null,
    location: { origin: "https://exora.test" },
    skipWaiting: async () => undefined,
  };
  runInNewContext(source, { URL, caches, fetch: network, Response, self });

  const dispatch = async (
    type: string,
    request?: NavigationRequest | Request,
  ): Promise<Response | undefined> => {
    const pending: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    listeners.get(type)?.({
      ...(request ? { request } : {}),
      respondWith: (value) => {
        response = value;
      },
      waitUntil: (promise) => pending.push(promise),
    });
    const settled = await response;
    await Promise.all(pending);
    return settled;
  };
  return { dispatch, route: self.exoraRouteFor, stores };
};

test("requests are routed by what they are", async () => {
  const { route } = await createWorker(async () => new Response("net"));

  expect(route("/?planet=Earth", "navigate")).toBe("shell");
  expect(route("/assets/index-abc123.js", "no-cors")).toBe("immutable");
  expect(route("/api/planets/TRAPPIST-1%20e", "cors")).toBe("archive");
  expect(route("/sky/hyg-v44-vmag65.bin", "cors")).toBe("media");
  expect(route("/textures/earth.ktx2", "cors")).toBe("media");
  expect(route("/_vercel/insights/view", "cors")).toBeNull();
  expect(route("/sw.js", "cors")).toBeNull();
});

test("the shell is cached on install and served when the network is gone", async () => {
  let online = true;
  const worker = await createWorker(async () => {
    if (!online) throw new TypeError("offline");
    return new Response("fresh shell");
  });
  await worker.dispatch("install");
  online = false;

  const request: NavigationRequest = {
    method: "GET",
    mode: "navigate",
    url: "https://exora.test/?planet=Earth",
  };
  const response = await worker.dispatch("fetch", request);

  expect(await response?.text()).toBe("shell /");
});

test("archive answers are fetched fresh and the last good one is kept for offline", async () => {
  let online = true;
  const worker = await createWorker(async () => {
    if (!online) throw new TypeError("offline");
    return Response.json({ data: "fresh" });
  });
  const request = () => new Request("https://exora.test/api/planets/Kepler-22%20b");

  expect(await (await worker.dispatch("fetch", request()))?.json()).toEqual({ data: "fresh" });
  online = false;
  expect(await (await worker.dispatch("fetch", request()))?.json()).toEqual({ data: "fresh" });
});

test("failed archive answers are never cached", async () => {
  let status = 502;
  const worker = await createWorker(async () => new Response("error", { status }));
  await worker.dispatch("fetch", new Request("https://exora.test/api/stars/Vega"));
  status = 200;

  expect([...(worker.stores.get("exora-archive-v1")?.keys() ?? [])]).toEqual([]);
});

test("activation removes caches from earlier versions only", async () => {
  const worker = await createWorker(async () => new Response("net"));
  worker.stores.set("exora-assets-v0", new Map());
  worker.stores.set("another-app", new Map());
  await worker.dispatch("activate");

  expect(worker.stores.has("exora-assets-v0")).toBe(false);
  expect(worker.stores.has("another-app")).toBe(true);
});
