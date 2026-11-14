# Interface and responsiveness

Exora's world is the primary view. The interface keeps the destination, travel actions and four
headline readings visible. Rendering caveats stay visible beside the headline readings. Show details opens explanations,
sources and scientific tabs. On phones, those readings share a sheet with the destination. The half-open sheet scrolls;
the fully opened sheet pauses rendering. Hiding the interface or travelling resumes the scene.

The interface uses self-hosted Atkinson Hyperlegible Next, larger small labels and stronger text
contrast. Search and Explore retain visible labels on phones. Explore uses short section names,
without repeated source subtitles or instructions; sources remain with the scientific readings.

## Implementation choices

- Keep React 19 and Babylon.js. A framework replacement would leave the expensive work unchanged.
- Use a persistent module Web Worker for catalog download, JSON decoding, searches and pagination.
  Only requested results cross back to React. Until ready, or after a worker error, reads use the API.
- Load each Explore tool through React lazy and Suspense. Navigation and Close stay available
  while a tool loads.
- Sample frame rate in a leaf component instead of rerendering the destination shell every second.
- Replace backdrop blur with near-opaque surfaces so UI compositing does not repeatedly filter
  the animated WebGL canvas.

Design guidance came from Claude Fable 5.2 and the Game UI Frontend skill: protect the scene,
keep one compact secondary surface, and reveal explanations when requested.

## Observed evidence

Local Chromium measurements on 14 November 2026:

| Check                                               |   Before |   After |
| --------------------------------------------------- | -------: | ------: |
| Explore entry JavaScript, uncompressed              | 62.84 KB | 6.87 KB |
| Explore entry CSS, uncompressed                     | 31.71 KB | 4.63 KB |
| Maximum input timer gap during 100 catalog searches |   147 ms |    5 ms |
| Wall time for those 100 searches                    |   146 ms |  152 ms |

The search comparison loaded the same snapshot into the previous main-thread implementation and
the worker, searched for `kepler` 100 times sequentially, and sampled a 4 ms input timer on an
otherwise idle page. It measures responsiveness during repeated work, not an overall frame-rate
claim. Device, GPU and browser affect results. Chunk sizes are build output for the entry chunk;
individual catalog tools still load when needed.

Validation includes `vp check`, `vp test`, workspace tests and builds, asset provenance, the
production JavaScript budget, discovery checks, the Cloudflare dry run and desktop/mobile browser
journeys. Browser tests exercise the real catalog worker separately from deterministic API
fixtures, disclosures, sheet scrolling and render suspension, clear view, travel, search and AR
controls. Visual inspection covered desktop, tablet and phone layouts and the expanded readings.
