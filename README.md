# Exora

Explore plausible procedural alien worlds generated from real NASA exoplanet data. The project is VR-first and currently targets WebXR in Meta Quest Browser.

## First working draft

The initial vertical slice renders HIP 65426 b from a local NASA Exoplanet Archive fixture. It includes:

- a deterministic data-to-world recipe;
- procedural gas-giant cloud shaders and atmosphere glow;
- an interactive Babylon.js scene with desktop orbit controls;
- a responsive observation HUD; and
- a WebXR entry flow with a teleportable viewing deck.

The visualization distinguishes archive observations from Exora's inferred and generated details. It is not observed imagery.

## Development

Install the workspace and start the site:

```bash
vp install
vp run dev
```

Then open <http://localhost:5173>.

Run the complete validation suite:

```bash
vp run ready
```

WebXR requires a secure context. Localhost works for desktop development; testing from a Quest on the local network will require serving the app over HTTPS or deploying it to an HTTPS host.

## Current workspace

```text
apps/website             Babylon.js experience and interface
packages/utils           Starter shared package (to be replaced as the domain grows)
```

The next vertical slice should add the Hono API, normalize NASA TAP responses, and move the reusable world recipe into a shared package.
