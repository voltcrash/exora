# Performance quality gates

## Startup code

The website uses React 19 and React DOM through the standard React Vite plugin in development,
production builds, and the unit and browser test projects.

Code that does not contribute to the initial destination is loaded on demand. The site ships no
third-party analytics or real-user monitoring script; traffic is read from the host's own request
analytics instead, so no visitor downloads or runs telemetry code.

The planet mass-radius diagram and signal curves load when their Physics or Signal tab opens;
their Suspense boundaries cover only the charts. Guided-tour data and controls load when a tour
starts or its URL opens. The scene host, initial scene preload, world mounting, and first-frame
callbacks do not wait for any of these features. Browser regressions cover opening both chart tabs
after the world is ready, and restoring, advancing, and leaving a tour.

The website build measures initial and largest-file JavaScript separately. Destination modules, Blender fields and the stellar catalog load as their views need them.

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

## Interpreting graphics measurements

The composite performance score and total blocking time are warnings. Three.js draws throughout the audit, and software rendering on GPU-less CI competes for main-thread time. Compare the device, viewport, rendering backend and scene when recording frame rate. The website build prints measured JavaScript sizes and enforces the byte limits above.

The terrain benchmark and worker tests measure the numerical geology kernels independently. The live Three.js surface interpolates its walking height from the same triangles it draws. The browser suite checks that correspondence and exercises landing, walking and returning to orbit.
