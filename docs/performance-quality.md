# Performance quality gates

Exora runs Lighthouse CI against the production website build in two profiles. Desktop uses the
host connection and desktop Lighthouse preset. Mobile uses a 393 × 823 viewport, 4× CPU slowdown,
and simulated mobile networking. Each profile collects five samples, and every assertion evaluates
the median value so a single noisy WebGL frame cannot either fail or rescue the build.

The following are hard failures in both profiles:

- accessibility, best-practices, and SEO category scores;
- first contentful paint (3 s);
- largest contentful paint (5 s);
- cumulative layout shift (0.1); and
- total transfer weight (7.5 MB).

The emitted JavaScript budgets remain separate hard build failures: initial JavaScript must stay at
or below 450 kB and every emitted JavaScript file at or below 400 kB.

## Warning-only metrics

The overall performance category and total blocking time remain warnings. Exora starts a live
Babylon.js render loop during the audit, and GPU-less CI runners can fall back to SwiftShader.
Scheduling software-rendered frames competes with Lighthouse's main-thread probes, so total blocking
time and the composite score derived from it vary even when the application code and stable paint
timings do not. Median sampling contains this variation without forcing GPU-equipped runners onto a
slower rendering backend.

Unused JavaScript also remains a warning. Lighthouse measures coverage only during its short load
window; Babylon's mesh and math modules contain paths used after interaction, travel, WebXR entry,
context recovery, and KTX2 capability selection. Removing those paths or deferring renderer startup
would make the initial scene unrepresentative. Application and optional-feature code should still
be split when it can be deferred without delaying the first scene; the warning is retained to make
regressions visible rather than converting Babylon's necessary runtime surface into a brittle hard
failure.
