# Interface and responsiveness

Exora's world is the primary view. The interface keeps the destination, travel actions and four
headline readings visible. Rendering caveats stay visible beside the headline readings. Details
opens explanations, sources and scientific tabs. On phones, those readings share a sheet with the
destination. The half-open sheet scrolls; the fully opened sheet pauses rendering. Hiding the
interface or travelling resumes the scene.

## Words

Text appears only where it helps someone act or understand a reading:

- A destination shows its category, its name and one line of traits such as `Ice giant / 531 K`.
  The discovery method lives in the Record tab.
- The readings panel starts with its four measurements. The archive is credited once, in the
  footer of Details.
- Pointer and keyboard hints fade after the first drag or scroll, or after eight seconds.
- Catalogue cards show a name and one line of facts. Status lines report counts and failures, not
  what is loading. Loading is a spinner.
- Search results pair a name with a one-word kind.
- Loading screens name the destination.

## Typography

The interface uses self-hosted IBM Plex Sans for text and readings. Its tabular figures keep values
aligned without the slashed zeros that made catalogue IDs and decimals noisy. Geist Mono is used
for keyboard keys, seeds and slider values. Text uses weights 300, 400, 500 and 600, and three
distinct ink levels that stay above 4.5:1 on the panel surface.

## Implementation choices

- Keep React 19 and Babylon.js. A framework replacement would leave the expensive work unchanged.
- Compile components with React Compiler 1.0 through the `@vitejs/plugin-react` Babel preset, so
  readouts, travel state and search re-render only what changed. The native Rust compiler is
  experimental and requires an `oxc-transform-react` release older than the current one.
- Use a persistent module Web Worker for catalog download, JSON decoding, searches and pagination.
  Only requested results cross back to React. Until ready, or after a worker error, reads use the API.
- Load each Explore tool through React lazy and Suspense. Section switches, gallery and list
  toggles and infinite-scroll appends run as transitions, so input is never blocked behind a
  catalogue render.
- Skip layout and paint for off-screen catalogue cards with `content-visibility: auto`.
- Draw thumbnails without CSS filters or stacked glows, and float controls over the scene without
  drop shadows or backdrop blur.
- Sample frame rate in a leaf component instead of rerendering the destination shell every second.

Design guidance came from Claude Fable 5.2 and the frontend design skill: protect the scene, keep
one compact secondary surface, and cut words that restate what the screen already shows.

## Observed evidence

Local Chromium measurements on 14 November 2026, comparing `main` with this change. Both builds
were served by the Node server from their production output, with WebGL on SwiftShader.

| Check                                                          |   Before |    After |
| -------------------------------------------------------------- | -------: | -------: |
| Main-thread script time while loading 300 more catalogue cards |    40 ms |    20 ms |
| GPU raster time while scrolling 10,000 px of 361 cards         | 5,499 ms | 3,623 ms |
| Initial JavaScript, uncompressed                               | 348.2 KB | 356.1 KB |

Script time is the median of three runs of Chrome's `ScriptDuration` metric. Raster time is the
median of three traces of `RasterDecoderImpl::DoEndRasterCHROMIUM`. Other work on the machine made
wall-clock frame times too noisy to report. The extra initial JavaScript is the compiler's
memoisation code. Device, GPU and browser affect results.

Validation includes `vp check`, `vp test`, workspace tests and builds, asset provenance, the
production JavaScript budget, discovery checks, the Cloudflare dry run and desktop/mobile browser
journeys. Visual inspection covered desktop and phone layouts of every destination type, Explore
section, the search palette and the readings panel.
