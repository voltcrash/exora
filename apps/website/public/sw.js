/*
 * EXORA OFFLINE
 *
 * The app shell and everything with a content hash are kept after the first visit, so Exora opens
 * without a network; that includes the planet catalogue snapshot, so search and browse work too.
 * Textures, transcoders and the sky catalogue are served from cache and refreshed behind the
 * scenes. Archive answers are always asked for fresh, and only when the network fails is the last
 * good answer used — the panels already say when data is cached.
 */

const VERSION = "v3";
const SHELL_CACHE = `exora-shell-${VERSION}`;
const ASSET_CACHE = `exora-assets-${VERSION}`;
const MEDIA_CACHE = `exora-media-${VERSION}`;
const ARCHIVE_CACHE = `exora-archive-${VERSION}`;
const CACHES = [SHELL_CACHE, ASSET_CACHE, MEDIA_CACHE, ARCHIVE_CACHE];
const MEDIA_LIMIT = 160;
const ARCHIVE_LIMIT = 240;
const SHELL = ["/", "/manifest.webmanifest", "/exora-orbit.svg", "/icon-192.png"];
// Keep hashed snapshots available to clients running an earlier deployment.
const ARCHIVE_MAX_AGE_MS = 7 * 86_400_000;

/** Which strategy a same-origin GET takes, or null to leave it to the network untouched. */
const routeFor = (pathname, mode) => {
  if (pathname === "/sw.js") return null;
  if (mode === "navigate") return pathname === "/" ? "shell" : "document";
  if (pathname.startsWith("/assets/")) return "immutable";
  if (pathname.startsWith("/api/")) return "archive";
  if (pathname === "/discovery.css") return "media";
  if (/^\/(textures|ktx2|sky|models)\//.test(pathname)) return "media";
  if (/\.(png|svg|ico|webmanifest|jpg)$/.test(pathname)) return "media";
  return null;
};

const trim = async (cacheName, limit) => {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(
    keys.slice(0, Math.max(0, keys.length - limit)).map((key) => cache.delete(key)),
  );
};

const store = async (cacheName, request, response, limit) => {
  if (!response || !response.ok || response.type === "opaque") return;
  const cache = await caches.open(cacheName);
  response = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  response.headers.set("X-Exora-Stored-At", String(Date.now()));
  await cache.put(request, response);
  if (limit) await trim(cacheName, limit);
};

const networkFirst = async (event, cacheName, fallbackUrl, limit) => {
  let failedResponse;
  try {
    const response = await fetch(event.request, { signal: AbortSignal.timeout(30_000) });
    if (response.status >= 500) {
      failedResponse = response;
      throw new Error("Upstream unavailable");
    }
    // Every destination URL is the same single-page shell, so navigations share one entry.
    const key = fallbackUrl ?? event.request;
    event.waitUntil(store(cacheName, key, response.clone(), limit));
    return response;
  } catch (error) {
    const cached =
      (await caches.match(event.request)) ?? (fallbackUrl ? await caches.match(fallbackUrl) : null);
    if (cached) {
      if (cacheName !== ARCHIVE_CACHE) return cached;
      const storedAt = Number(cached.headers.get("X-Exora-Stored-At"));
      if (storedAt > 0 && Date.now() - storedAt <= ARCHIVE_MAX_AGE_MS) {
        try {
          const payload = await cached.clone().json();
          if (payload.meta) {
            payload.meta.cached = true;
            if ("stale" in payload.meta) payload.meta.stale = true;
            return Response.json(payload, { headers: { "X-Exora-Cache": "offline" } });
          }
        } catch {
          /* A non-JSON archive response retains its original bytes. */
        }
        return cached;
      }
    }
    if (failedResponse) return failedResponse;
    throw error;
  }
};

const cacheFirst = async (event, cacheName, limit, revalidate) => {
  const cached = await caches.match(event.request);
  if (cached && !revalidate) return cached;
  const refresh = fetch(event.request).then(async (response) => {
    await store(cacheName, event.request, response.clone(), limit);
    return response;
  });
  if (cached) {
    if (revalidate) event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }
  return refresh;
};

self.exoraRouteFor = routeFor;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("exora-") && !CACHES.includes(name))
            .map((name) => caches.delete(name)),
        ),
      ),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const route = routeFor(url.pathname, request.mode);
  if (route === "shell") event.respondWith(networkFirst(event, SHELL_CACHE, "/", 0));
  else if (route === "document") {
    event.respondWith(networkFirst(event, SHELL_CACHE, null, 0));
  } else if (route === "immutable") event.respondWith(cacheFirst(event, ASSET_CACHE, 0, false));
  else if (route === "media") event.respondWith(cacheFirst(event, MEDIA_CACHE, MEDIA_LIMIT, true));
  else if (route === "archive") {
    event.respondWith(networkFirst(event, ARCHIVE_CACHE, null, ARCHIVE_LIMIT));
  }
});
