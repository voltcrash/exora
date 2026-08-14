# Exora

Explore planets and stars through interactive, data-informed visualizations. Exora combines confirmed NASA exoplanet data with stellar observations from SIMBAD in a React + Vite experience targeting desktop and WebXR.

## Current vertical slice

The current slice renders HIP 65426 b using a normalized response from the NASA Exoplanet Archive. It includes:

- a React interface composed around an isolated Babylon.js rendering lifecycle;
- a Hono API with NASA TAP queries, response normalization, and a six-hour in-memory cache;
- an optional PostgreSQL catalog with idempotent NASA synchronization;
- a shared planet contract used by the API and renderer;
- a searchable confirmed-planet catalog with live scene switching;
- a keyless SIMBAD TAP integration with exact-name star resolution, featured stellar destinations, and twelve-hour caching;
- interactive stellar visualizations inferred from observed spectral classes;
- a two-mode World Forge for procedural planets and custom stars;
- a deterministic data-to-world recipe;
- procedural gas-giant clouds, methane-hazed ice giants, and displaced rocky terrain;
- an interactive Babylon.js scene with desktop orbit controls;
- a responsive observation HUD; and
- a WebXR entry flow with a teleportable viewing deck;
- adaptive Quest rendering with reduced geometry, dynamic desktop resolution, and fixed foveation;
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
GET /api/stars/featured
GET /api/stars?q=sirius&limit=12
GET /api/stars/:name
```

Run the complete validation suite:

```bash
vp run ready
```

## PostgreSQL catalog

Copy `.env.example` to `.env` and provide `DATABASE_URL`, then initialize and synchronize the catalog:

```bash
vp run db:migrate
vp run db:sync
```

When `DATABASE_URL` is present, the API serves lookups and searches from PostgreSQL. Without it, local development continues to query NASA directly. Catalog synchronization runs as an explicit job so production can schedule it independently from API startup.

WebXR requires a secure context. Localhost works for desktop development; testing from a Quest on the local network will require serving the app over HTTPS or deploying it to an HTTPS host.

Use the [Meta Quest smoke-test checklist](docs/quest-testing.md) for headset validation and performance targets.

## Current workspace

```text
apps/api                 Hono API with NASA and SIMBAD TAP adapters
apps/website             React + Vite interface and Babylon.js experience
packages/contracts       Shared API and exoplanet types
packages/worldgen        Deterministic data-to-world recipe engine
```

Gas giants, ice giants, and rocky worlds can be explored from catalog results. Only worlds without enough data for classification remain disabled. World generation lives in a shared package, while the API can synchronize NASA's confirmed catalog into PostgreSQL for durable, low-latency queries.

Stars are resolved by exact identifiers through the free, registration-free SIMBAD service operated by CDS, Strasbourg. Exora clearly labels the archive measurements separately from visual properties inferred from each star's spectral class.
