# Performance quality gates

## Startup code

The website uses React 19 and React DOM through the standard React Vite plugin in development,
production builds, and the unit and browser test projects.

Code that does not contribute to the initial destination is loaded on demand. Vercel Analytics
and Speed Insights mount after a paint during browser idle time, with a two-second timeout for
busy browsers and a timed fallback when the idle callback API is unavailable. An optional telemetry
chunk failing to load does not prevent the application from rendering.

The planet mass-radius diagram and signal curves load when their Physics or Signal tab opens;
their Suspense boundaries cover only the charts. Guided-tour data and controls load when a tour
starts or its URL opens. The scene host, initial scene preload, world mounting, and first-frame
callbacks do not wait for any of these features. Browser regressions cover telemetry scheduling,
opening both chart tabs after the world is ready, and restoring, advancing, and leaving a tour.

With React DOM and these deferrals, the October 2026 production build emits 447,506 bytes of initial
JavaScript across ten files, or 143,242 bytes after gzipping each file and summing the results.
The largest emitted JavaScript file is 375,542 bytes. Both the 450 kB initial limit and 400 kB
per-file limit remain unchanged. These are build-output sizes, not total route transfer or
first-scene timings; the latter also depend on dynamically loaded renderer assets and the device.

## Lighthouse

Exora runs Lighthouse CI against the production website build in two profiles. Desktop uses the
host connection and desktop Lighthouse preset. Mobile uses a 393 × 823 viewport, 4× CPU slowdown,
and simulated mobile networking. Each profile collects one report and writes it to its own
`.lighthouseci/desktop` or `.lighthouseci/mobile` directory.

The following are hard failures:

- accessibility (0.95), best-practices (0.9), and SEO (0.9) category scores;
- first contentful paint (3 s desktop, 4 s mobile);
- largest contentful paint (5 s desktop, 6 s mobile);
- cumulative layout shift (0.1); and
- total transfer weight (7.5 MB).

The emitted JavaScript budgets remain separate hard build failures: initial JavaScript must stay at
or below 450 kB and every emitted JavaScript file at or below 400 kB.

## Continuous integration

The standard `Quality` workflow runs on every pull request and push to `main`. It checks formatting,
linting, types, unit tests, asset provenance, every production build, the JavaScript performance
budget included in the website build, production dependency vulnerabilities, and the desktop
Chromium journey smoke suite. Lighthouse and the mobile journey configuration do not run in this
workflow.

The `Full browser quality` workflow runs nightly. It runs the desktop and mobile Chromium journey
configurations, builds the production website, and then runs both Lighthouse profiles without
reinstalling dependencies or Chromium between those checks. To start it on demand, open **Actions →
Full browser quality → Run workflow** in GitHub.

For equivalent local validation, install Chromium once and run:

```sh
vp exec --filter website -- playwright install chromium
vp run website#test:browser:desktop # PR browser coverage
vp run website#test:browser:full    # desktop and mobile browser coverage
vp run website#build
vp run quality:lighthouse           # desktop and mobile Lighthouse reports
```

## Warning-only metrics

The overall performance category and total blocking time remain warnings. Exora starts a live
Babylon.js render loop during the audit, and GPU-less CI runners can fall back to SwiftShader.
Scheduling software-rendered frames competes with Lighthouse's main-thread probes, so total blocking
time and the composite score derived from it vary even when the application code and stable paint
timings do not. Keeping these metrics warning-only prevents GPU-less runners from turning that
variation into brittle hard failures.

Unused JavaScript also remains a warning. Lighthouse measures coverage only during its short load
window; Babylon's mesh and math modules contain paths used after interaction, travel, WebXR entry,
context recovery, and KTX2 capability selection. Removing those paths or deferring renderer startup
would make the initial scene unrepresentative. Application and optional-feature code should still
be split when it can be deferred without delaying the first scene; the warning is retained to make
regressions visible rather than converting Babylon's necessary runtime surface into a brittle hard
failure.

The August 2026 audit reduced eager JavaScript from 390,515 bytes to about 266 kB by deferring the
Solar System/geology catalogs, custom-link helpers, development XR emulator, and runtime API schemas.
The remaining desktop coverage estimate is about 95 kB: roughly 59 kB in Babylon mesh/math paths and
36 kB in the React/application chunk. Those values are diagnostic rather than budgets because the
exact coverage depends on how many initial renderer tasks finish inside Lighthouse's sampling window.

## Terrain CPU benchmark

Run `vpx apps/website/scripts/benchmark-terrain.ts` from the repository root to sample 100,000
Mars terrain heights over six runs (the first warms the runtime). On Node 24.22.1 on an
Icestorm-M1 CPU, the five warmed runs at commit `7e2af576` took 249.65, 248.73, 248.74,
248.62, and 248.90 ms. Precomputing the eight fixed noise gradients took 99.88, 99.19,
100.52, 99.30, and 99.29 ms, a 60% reduction in the median. The checksum was
2328.326724431223 in both versions; a separate direct comparison of all 100,000 heights matched
exactly. This measures terrain sampling, not end-to-end loading or frame rate. Initial JavaScript
remained 295,205 bytes in both production builds.

Planet displacement and surface heightfield/material-channel sampling, far-field filtering,
occlusion, and sunlight baking now run in a module worker. The worker returns transferable typed
arrays; Babylon normal computation, mesh updates, materials, and scatter placement stay on the main
thread. The synchronous fallback uses the same kernels and arithmetic, including Float64 positions
when Babylon supplied JavaScript numbers. `WORLDGEN_VERSION` is unchanged. Cancellation terminates
the job, and scene/parent disposal guards prevent late results from creating or updating meshes.
Worker startup, execution, message, or timeout failures retry synchronously.

`vp run website#test:browser:desktop` includes real Chromium module-worker comparisons for Earth,
Mars, Mercury, and Venus. Every returned array is compared byte for byte with the synchronous path.
The desktop Mars bake test also reports synchronous main-thread time, worker dispatch main-thread
time, and worker wall time separately. One headless Chromium development-test run on the aarch64
container with Node 24.22.1 measured 104.30 ms, 0.20 ms, and 155.10 ms respectively for a 208 × 208
cell grid. This single sample includes worker startup/module loading in wall time and excludes
Babylon mesh construction, return-message handling, and frame scheduling. It demonstrates removal
of the blocking numerical loop, not an end-to-end loading or frame-rate improvement; rerun locally
for representative hardware measurements.

Vite emits `terrain.worker-<hash>.js` under `/assets/`. The service worker caches it with other
immutable hashed assets after first use. The performance-budget script counts every emitted worker
against the per-file limit, while only JavaScript referenced by the initial HTML counts against the
initial-load limit. No worker chunk is added to the initial HTML.
