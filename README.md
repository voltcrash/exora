# Exora

Explore plausible procedural alien worlds generated from real NASA exoplanet data. The project is VR-first and currently targets WebXR in Meta Quest Browser.

## Current vertical slice

The current slice renders HIP 65426 b using a normalized response from the NASA Exoplanet Archive. It includes:

- a Hono API with NASA TAP queries, response normalization, and a six-hour in-memory cache;
- a shared planet contract used by the API and renderer;
- a deterministic data-to-world recipe;
- procedural gas-giant cloud shaders and atmosphere glow;
- an interactive Babylon.js scene with desktop orbit controls;
- a responsive observation HUD; and
- a WebXR entry flow with a teleportable viewing deck;
- a local data fallback when NASA or the API is unavailable.

The visualization distinguishes archive observations from Exora's inferred and generated details. It is not observed imagery.

## Development

Install the workspace and start the API and site together:

```bash
vp install
vp run dev
```

Then open <http://localhost:5173>.

The Hono API listens on <http://localhost:8787>. Its initial routes are:

```text
GET /api/health
GET /api/planets?q=kepler&limit=12
GET /api/planets/featured
GET /api/planets/:name
```

Run the complete validation suite:

```bash
vp run ready
```

WebXR requires a secure context. Localhost works for desktop development; testing from a Quest on the local network will require serving the app over HTTPS or deploying it to an HTTPS host.

## Current workspace

```text
apps/api                 Hono API and NASA TAP adapter
apps/website             Babylon.js experience and interface
packages/contracts       Shared API and exoplanet types
packages/utils           Starter package (scheduled for replacement)
```

The next vertical slice should add a planet search/selection interface, move world generation into a shared package, and introduce PostgreSQL-backed catalog synchronization.
