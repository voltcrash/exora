# Performance quality gates

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
