# Third-Party Asset Provenance

## Known Solar System surface maps

Known bodies do not use Exora's inferred exoplanet color at orbital distance when an authoritative
global mosaic exists. These equirectangular maps are sampled directly on the sphere, then lit by
Exora's day/night, atmosphere, cloud, and ring passes. The map is never claimed to be live imagery:
it is the cited mission mosaic prepared for planetary visualization.

| Body    | Shipped file                        | Source data / preparation                        | Source page                                                                  |
| ------- | ----------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------- |
| Mercury | `textures/solar-system/mercury.jpg` | MESSENGER MDIS global mosaic / USGS Astrogeology | `astrogeology.usgs.gov/search/map/mercury_messenger_mdis_global_mosaic_250m` |
| Venus   | `textures/solar-system/venus.jpg`   | Magellan radar / NASA JPL-Caltech                | `science.nasa.gov/3d-resources/venus/`                                       |
| Earth   | `textures/solar-system/earth.jpg`   | MODIS Blue Marble / NASA Goddard                 | `visibleearth.nasa.gov/images/57723/the-blue-marble`                         |
| Mars    | `textures/solar-system/mars.jpg`    | Viking imagery / USGS / NASA JPL-Caltech         | `science.nasa.gov/3d-resources/mars/`                                        |
| Jupiter | `textures/solar-system/jupiter.jpg` | Voyager imagery / NASA JPL-Caltech               | `science.nasa.gov/3d-resources/jupiter/`                                     |
| Saturn  | `textures/solar-system/saturn.jpg`  | NASA/JPL Solar System Simulator visualization    | `science.nasa.gov/3d-resources/saturn/`                                      |
| Neptune | `textures/solar-system/neptune.jpg` | NASA/JPL Solar System Simulator visualization    | `science.nasa.gov/3d-resources/neptune/`                                     |
| Pluto   | `textures/solar-system/pluto.jpg`   | New Horizons MVIC global color map / NASA/JHUAPL | `science.nasa.gov/resource/pluto-global-color-map/`                          |

### Principal moon mosaics

The 21 principal moons below are the complete set for which NASA's current public visualization
library provides a prepared global mission map. The Moon uses the 2025 LRO color map made
specifically for 3D rendering; Triton uses USGS's global color mosaic; the remaining files come
from NASA's mirrored 3D Resources set. Mission coverage gaps remain visible instead of being
filled with invented geography.

| System  | Shipped files                                                                                   | Source data / preparation                      | Source pages                                   |
| ------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| Earth   | `moon.jpg`                                                                                      | LRO WAC 2025 global color map / NASA GSFC SVS  | `svs.gsfc.nasa.gov/4720/`                      |
| Mars    | `phobos.jpg`, `deimos.jpg`                                                                      | Viking mission maps / NASA JPL-Caltech         | `science.nasa.gov/3d-resources/`               |
| Jupiter | `io.jpg`, `europa.jpg`, `ganymede.jpg`, `callisto.jpg`                                          | Voyager and Galileo mission mosaics / NASA     | `science.nasa.gov/3d-resources/`               |
| Saturn  | `mimas.jpg`, `enceladus.jpg`, `tethys.jpg`, `dione.jpg`, `rhea.jpg`, `titan.jpg`, `iapetus.jpg` | Cassini mission mosaics / NASA JPL-Caltech SSI | `science.nasa.gov/3d-resources/`               |
| Uranus  | `miranda.jpg`, `ariel.jpg`, `umbriel.jpg`, `titania.jpg`, `oberon.jpg`                          | Voyager 2 mission mosaics / NASA JPL-Caltech   | `science.nasa.gov/3d-resources/`               |
| Neptune | `triton.jpg`                                                                                    | Voyager 2 global color mosaic / NASA JPL USGS  | `science.nasa.gov/photojournal/map-of-triton/` |
| Pluto   | `charon.jpg`                                                                                    | New Horizons mission mosaic / NASA JHUAPL SwRI | `science.nasa.gov/3d-resources/`               |

The NASA 3D Resources copies were taken from NASA's public `NASA-3D-Resources` GitHub mirror.
NASA states that the hub's assets are free to download and use subject to the NASA Images and
Media Usage Guidelines. The Mercury browse mosaic is published by USGS as public domain. Uranus
has no comparable resolved global color mosaic, so Exora keeps its physically tuned ice-giant
shader instead of inventing surface geography.

### Remaining dwarf planets

Retrieval date for every row in this section: **2026-08-23**. JPL's permanent asteroid-system
SPK identifiers use the current eight-digit scheme; Ceres also retains legacy NAIF body code
`2000001`, which remains present in generic SPICE kernels. The catalog records both rather than
silently treating one numbering scheme as the other.

| Body / data                                   | Mission or archive                                                       | Shipped asset / dataset                                                                                                                                            | Permanent NAIF / SPK ID        | Credit                                               | License / use terms                                                                             | Original URL                                                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ceres global image mosaic                     | Dawn FC, HAMO / USGS Astropedia                                          | `textures/solar-system/ceres.jpg` (1024×512 browse derivative; SHA-256 `12fe5bf219161b4cc39a9d72040f7400b57b8ae9dd6cb8073ab1b7b26403e73c`)                         | NAIF `2000001`; SPK `20000001` | NASA/JPL-Caltech/UCLA/MPS/DLR/IDA; USGS Astrogeology | US Government work; Astropedia asks users to cite the product authors                           | https://astrogeology.usgs.gov/ckan/dataset/6ad84c9a-1fad-4869-b4f6-b52c5c2ace36/resource/9f757a65-8d8a-4349-a72d-8062387574b3/download/ceres_dawn_fc_dlr_global_feb2016_1024.jpg  |
| Ceres global topography                       | Dawn FC2, HAMO stereo-photogrammetry / DLR / USGS Astropedia             | `textures/solar-system/ceres-topography.jpg` (1024×512 browse derivative of 137 m DTM; SHA-256 `3f5b7d16ef80f155fd4c776a3f6cfab0e421372c1466aea52a689c10e593d4d7`) | NAIF `2000001`; SPK `20000001` | F. Preusker et al.; DLR; Dawn FC2; USGS Astrogeology | US Government work; cite Preusker et al. (2016) and dataset `DAWN-A-FC2-5-CERESHAMODTMSPG-V1.0` | https://astrogeology.usgs.gov/ckan/dataset/1a165f71-5f31-44b6-b770-63e53b53902e/resource/a407b289-19ab-451d-bd3d-e423b9949a08/download/ceres_dawn_fc_hamo_dtm_dlr_global_1024.jpg |
| Ceres physical and orbital parameters         | JPL SSD planetary parameters; JPL SBDB API 1.3                           | Authored catalog values; no binary asset                                                                                                                           | NAIF `2000001`; SPK `20000001` | NASA/JPL Solar System Dynamics                       | NASA/JPL data; no additional license asserted                                                   | https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=1&phys-par=1&full-prec=1                                                                                                               |
| Eris physical and orbital parameters          | JPL SSD planetary parameters; JPL SBDB API 1.3                           | Authored catalog values; no surface asset                                                                                                                          | SPK `20136199`                 | NASA/JPL Solar System Dynamics                       | NASA/JPL data; no additional license asserted                                                   | https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=136199&phys-par=1&full-prec=1                                                                                                          |
| Haumea physical and orbital parameters        | JPL SSD planetary parameters; JPL SBDB API 1.3; 2017 stellar occultation | Authored catalog values and measured triaxial dimensions; no surface asset                                                                                         | SPK `20136108`                 | NASA/JPL SSD; Ortiz et al.                           | Catalog facts only; source publications cited                                                   | https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=136108&phys-par=1&full-prec=1                                                                                                          |
| Makemake physical and orbital parameters      | JPL SSD planetary parameters; JPL SBDB API 1.3                           | Authored catalog values; no surface asset                                                                                                                          | SPK `20136472`                 | NASA/JPL Solar System Dynamics                       | NASA/JPL data; no additional license asserted                                                   | https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=136472&phys-par=1&full-prec=1                                                                                                          |
| Dysnomia orbit and discovery data             | Hubble / Keck; JPL small-body satellite conventions                      | Authored catalog values; no surface asset                                                                                                                          | SPK `120136199`                | NASA, ESA; Brown & Schaller                          | Factual data; no imagery redistributed                                                          | https://science.nasa.gov/missions/hubble/astronomers-measure-mass-of-largest-dwarf-planet/                                                                                        |
| Hiʻiaka and Namaka discovery and orbit data   | Keck / Hubble; JPL small-body satellite conventions                      | Authored catalog values; no surface asset                                                                                                                          | SPK `120136108`, `220136108`   | NASA/JPL SSD; discovery teams                        | Factual data; no imagery redistributed                                                          | https://science.nasa.gov/dwarf-planets/haumea/                                                                                                                                    |
| S/2015 (136472) 1 (MK2) discovery constraints | Hubble WFC3                                                              | Authored catalog values; no surface asset                                                                                                                          | SPK `120136472`                | NASA, ESA, A. Parker, M. Buie, W. Grundy, K. Noll    | Factual data; no imagery redistributed                                                          | https://science.nasa.gov/asset/hubble/makemake-and-its-moon/                                                                                                                      |

Ceres's displayed topography is sampled from the Dawn HAMO DTM at the body's measured
peak-to-peak relief scale. It is not procedural terrain. The source mosaic contains varying
illumination, and Dawn's south-polar imaging/derived-crater coverage is incomplete; the renderer
does not patch those gaps. Eris, Makemake, and the four added moons have never been resolved as
global surfaces. Haumea's occultation-constrained proportions are measured, but its visible
material is still only a neutral water-ice treatment. The UI labels all of these limitations at
the point of use.

## Planet textures

Exora's macro terrain, oceans, ice, lava, cloud systems, giant bands, geometry, and base color are
procedurally generated from `WorldRecipe` data. Texture assets add close-range material detail;
they are never presented as observed imagery of a real exoplanet.

### CC0 physical-detail maps

The rocky renderer uses a curated set of ambientCG normal and roughness maps through object-space
triplanar projection. Each planet selects only two families appropriate to its inferred mineral
palette, so the browser does not decode or upload all five sets.

| Family     | Use                                                | ambientCG asset | Source URL                        | License |
| ---------- | -------------------------------------------------- | --------------- | --------------------------------- | ------- |
| `granite`  | Silicate highlands and steep mineral outcrops      | `Rock058`       | https://ambientcg.com/a/Rock058   | CC0 1.0 |
| `basalt`   | Volcanic, iron-rich, and carbon-rich crust         | `Rock035`       | https://ambientcg.com/a/Rock035   | CC0 1.0 |
| `cracked`  | Impact rims, sulfur crust, and fractured lava rock | `Rock063`       | https://ambientcg.com/a/Rock063   | CC0 1.0 |
| `regolith` | Dust, desert sediment, and loose surface grains    | `Gravel043`     | https://ambientcg.com/a/Gravel043 | CC0 1.0 |
| `ice`      | Frozen caps and globally glaciated surfaces        | `Snow006`       | https://ambientcg.com/a/Snow006   | CC0 1.0 |

Source archives were downloaded from
`https://ambientcg.com/get?file=<AssetId>_2K-PNG.zip`. For each family, Exora keeps the 2K
OpenGL normal map and the roughness map. Source 16-bit normals were converted to 8-bit RGB:
browser GPU texture sampling is normalized 8-bit in this path, so this removes download weight
without reducing the precision the shader consumes. Unused color, AO, displacement, scene, and
material files are not shipped.

`Rock063` is natively 2048×1024; the other four families are 2048×2048, and the encoded files keep
those dimensions. The PNGs are the _source_: what ships is KTX2, so the GPU receives a compressed
format rather than decoding a full-size image. Normals are UASTC with Zstandard supercompression,
roughness is the smaller ETC1S, and every file carries a complete mip chain — twelve levels at 2K —
sampled with tier-specific anisotropic filtering. `docs/texture-compression.md` holds the encoder
commands and the settings behind that split.

Creator: ambientCG / Lennart Demes. Attribution is not legally required under CC0, but provenance
is retained here.

### Exora chemistry color-detail maps

The five files under `apps/website/public/textures/chemistry/` were generated specifically for
Exora using OpenAI's built-in image generation tool, then resized to power-of-two 1024×1024 for
reliable mipmapping and wrapping. They ship as ETC1S KTX2 with a complete eleven-level mip chain,
encoded from those PNG sources:

- `carbon.ktx2`
- `ice.ktx2`
- `oxidized.ktx2`
- `silicate.ktx2`
- `sulfuric.ktx2`

They are flat-lit, orthographic, texture-only material scans with no text, objects, horizon, or
baked directional lighting. The exact production prompt set is recorded in
`docs/planet-texture-prompts.md`.

On Quest and mobile, only the palette-selected 1K chemistry map is sampled. Desktop adds the two
palette-selected 2K normal/roughness pairs. This keeps chemistry visible on constrained headsets
without paying the full physical-detail fragment cost.

## Babylon.js KTX2 runtime

`apps/website/public/ktx2/` holds the decoder and transcoders Babylon needs to turn the KTX2
detail maps above into a GPU-native format. They are vendored rather than fetched, because
Babylon's defaults point every one of them at `https://cdn.babylonjs.com`: that put a third-party
origin on the critical path of a texture Exora already serves itself, sent a cross-origin request
no visitor agreed to, and made a CDN outage fail a rocky world outright — the decoder is loaded
with `importScripts` inside a worker, so an unreachable one throws rather than degrading.

`apps/website/src/ktx2-transcoder.ts` points `KhronosTextureContainer2.URLConfig` at these copies.
Leaving an entry unset does not disable it; the decoder falls back to its own built-in CDN URL, so
every key has to be covered. `ktx2-transcoder.test.ts` fails if one is missed or if a later
Babylon release adds another.

| File                           | Purpose                                      | Source                                 |
| ------------------------------ | -------------------------------------------- | -------------------------------------- |
| `babylon.ktx2Decoder.js`       | Worker-side decoder entry point              | npm `babylonjs-ktx2decoder@9.22.1`     |
| `msc_basis_transcoder.js/wasm` | ETC1S/BasisLZ — roughness and chemistry maps | `cdn.babylonjs.com/ktx2Transcoders/1/` |
| `uastc_astc.wasm`              | UASTC → ASTC, used on Quest and mobile       | `cdn.babylonjs.com/ktx2Transcoders/1/` |
| `uastc_bc7.wasm`               | UASTC → BC7, used on desktop                 | `cdn.babylonjs.com/ktx2Transcoders/1/` |
| `uastc_r8_unorm.wasm`          | UASTC → R8, single-channel fallback          | `cdn.babylonjs.com/ktx2Transcoders/1/` |
| `uastc_rg8_unorm.wasm`         | UASTC → RG8, two-channel fallback            | `cdn.babylonjs.com/ktx2Transcoders/1/` |
| `uastc_rgba8_srgb_v2.wasm`     | UASTC → RGBA8 sRGB, uncompressed fallback    | `cdn.babylonjs.com/ktx2Transcoders/1/` |
| `uastc_rgba8_unorm_v2.wasm`    | UASTC → RGBA8 linear, uncompressed fallback  | `cdn.babylonjs.com/ktx2Transcoders/1/` |
| `zstddec.wasm`                 | Zstandard supercompression on the normals    | `cdn.babylonjs.com/zstddec.wasm`       |

Babylon.js is Apache-2.0; these are redistributed unmodified under that licence. They are excluded
from formatting and linting in the root `vite.config.ts`, because reformatting a minified bundle
rewrites an artifact this repository did not author and inflates it by roughly half.

The transcoders sit behind a stable `ktx2Transcoders/1/` path rather than a release version, so
they change rarely. When `@babylonjs/core` is upgraded, re-download the decoder at the matching
version and re-check the transcoders:

```sh
curl -sL "$(vp info babylonjs-ktx2decoder@<version> dist.tarball --json | tr -d '"')" | tar xz -O package/babylon.ktx2Decoder.js > apps/website/public/ktx2/babylon.ktx2Decoder.js
curl -sL -o apps/website/public/ktx2/<file> https://cdn.babylonjs.com/ktx2Transcoders/1/<file>
```

Keep the files byte-for-byte as published — do not run them through `vp fmt`.

## Star catalogue

`apps/website/public/sky/hyg-v44-vmag65.bin` is the sky itself: the real stars, with real
distances, that `sky-catalog.ts` re-observes from whatever object the visitor is standing on. It
is a filtered subset of the **HYG star database, version 4.4**.

| Field               | Value                                                                      |
| ------------------- | -------------------------------------------------------------------------- |
| Database            | HYG (Hipparcos–Yale–Gliese), v4.4                                          |
| Compiler            | David Nash / Astronomy Nexus                                               |
| Home                | https://codeberg.org/astronexus/hyg                                        |
| Source file         | `data/hyg/CURRENT/hyg_v44.csv.gz`                                          |
| Source SHA-256      | `00b349893b9a53106dd488d8371e8d2fa586043e500bb3cdb8bff3931682197d`         |
| Licence             | CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)             |
| Upstream astrometry | Hipparcos (ESA 1997), Yale Bright Star Catalog (5th ed.), Gliese (3rd ed.) |
| Epoch and equinox   | J2000.0, ICRS                                                              |

HYG is licensed **share-alike**, so the derived asset in this repository is distributed under
CC BY-SA 4.0 as well. Attribution and this provenance record satisfy the BY term; the SA term
applies to the star data and not to Exora's own source.

### What the subset contains

`apps/website/scripts/build-star-catalog.ts` reads the published CSV and writes the binary. Run it
with `vp run website#star-catalog`; with no arguments it downloads the pinned release, and the
SHA-256 above is verified either way, so a changed upstream file fails the build rather than
quietly rewriting the sky.

Of HYG's 119,614 rows it keeps **8,880**:

- Everything at V ≤ 6.5, the naked-eye limit under a dark sky. Hipparcos is complete well past
  that cut, so this is the whole visible sky rather than a sample of it.
- Row 0, the Sun, is dropped. HYG carries it at distance zero in the direction of the vernal
  equinox because it has no direction to record; it is the origin of the frame, not a star in it.
- **40 stars are dropped for having no colour index.** Point colour is derived from the catalogued
  B-V, and a star without one has no colour this renderer is entitled to draw — painting it white
  would be indistinguishable from a real A0 star, so it leaves the asset instead.
- **197 of the 8,880 have no usable parallax.** HYG marks these by setting the distance to
  100,000 pc; the build rewrites that marker as zero and the renderer treats them as being at
  infinity — drawn in their catalogued direction, never moved, magnitude never recomputed. They
  are not given an invented distance.

Five columns ship per star: right ascension and declination in radians, distance in parsecs, and
Johnson V and B-V in thousandths of a magnitude. Every one is a value HYG publishes. The file is a
16-byte header followed by five parallel arrays (`Float32`×3, `Int16`×2), 142,096 bytes in total,
about 104 KB over the wire; the browser maps each column onto a typed array with no copying and no
parsing. Stars are ordered brightest-first as seen from Earth, which costs nothing and compresses
better than catalogue order.

The filename carries the catalogue version, so `vercel.json` can serve it `immutable`. Regenerating
from a different HYG release means a new filename, and the URL in `sky-catalog.ts` moves with it.

### What it does not claim

- **The bright-star cut is relative to Earth.** A star too faint to make V ≤ 6.5 from here is
  absent from the asset even if the viewpoint happens to be close enough to it that it would be
  brilliant from there. The sky Exora draws from a distant world is therefore complete for
  everything Earth can see and silent about everything it cannot.
- **Positions are J2000.0.** Proper motion is catalogued but not applied; over the centuries a
  visitor might imagine travelling, real stars would drift.
- **Distances are inverted parallaxes**, carrying the parallax's error with them. At the far end of
  the catalogue — around 1,000 pc, where HYG stops trusting the parallax at all — that error is a
  large fraction of the distance.
- **Every star is one point of one size.** Apparent magnitude drives colour intensity, not point
  size, so the sky is flatter than the real one at the bright end.
