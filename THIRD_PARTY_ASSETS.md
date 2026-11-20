# Third-Party Asset Provenance

## Solar System regions

Retrieved 2026-08-23. These views redistribute no external imagery, particle catalogue, or shape
asset. Exora generates deterministic point samples to communicate aggregate spatial structure;
the points have no designations and never claim to be individual catalogued objects. Every view
is anchored on the Sun (permanent NAIF/SPK `10`), except that the Jupiter Trojan view additionally
uses Jupiter's permanent NAIF/SPK `599` as its dynamical anchor. Scale, evidence class, source,
retrieval date, dataset identifier, and limitations are displayed in the destination UI.

| Authored dataset / view                           | Source / mission                                      | Credit                                            | Permanent anchor / dataset ID                 | License                                                       | Original URL                                                                |
| ------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Main Asteroid Belt 2.2–3.2 AU population envelope | NASA Science Dawn FAQ / Dawn                          | NASA/JPL-Caltech/UCLA/MPS/DLR/IDA                 | NAIF/SPK `10`; `NASA-DAWN-FAQ-MAIN-BELT`      | NASA media guidelines; factual data and U.S. Government works | https://science.nasa.gov/mission/dawn/faq/                                  |
| Jupiter L4/L5 Trojan population structure         | NASA Asteroid Facts / Lucy context                    | NASA Science Editorial Team; Lucy mission team    | NAIF/SPK `599`; `NASA-LUCY-TROJAN-POPULATION` | NASA media guidelines; factual data and U.S. Government works | https://science.nasa.gov/solar-system/asteroids/facts/                      |
| Kuiper Belt thick-disk population envelope        | NASA Kuiper Belt Facts                                | NASA Science Editorial Team                       | NAIF/SPK `10`; `NASA-KUIPER-BELT-FACTS`       | NASA media guidelines; factual data and U.S. Government works | https://science.nasa.gov/solar-system/kuiper-belt/facts/                    |
| Scattered Disk broad orbital envelope             | NASA Basics of Space Flight / JPL SSD orbital context | NASA/JPL Solar System Dynamics                    | NAIF/SPK `10`; `NASA-BASICS-SEDNA-ORBIT`      | NASA media guidelines; factual data and U.S. Government works | https://science.nasa.gov/learn/basics-of-space-flight/chapter1-1/           |
| Oort Cloud hypothesized shell                     | NASA Oort Cloud Facts                                 | NASA Science Editorial Team                       | NAIF/SPK `10`; `NASA-OORT-CLOUD-FACTS`        | NASA media guidelines; factual data and U.S. Government works | https://science.nasa.gov/solar-system/oort-cloud/                           |
| Heliosphere global morphology                     | NASA Components of the Heliosphere / IBEX and Voyager | NASA Heliophysics; IBEX and Voyager mission teams | NAIF/SPK `10`; `NASA-HEAT-HELIO-COMPONENTS`   | NASA media guidelines; factual data and U.S. Government works | https://science.nasa.gov/learn/heat/resource/components-of-the-heliosphere/ |
| Termination-shock crossing constraints            | Voyager Interstellar Mission                          | NASA/JPL-Caltech Voyager mission team             | NAIF/SPK `10`; `VOYAGER-TS-2004-2007`         | NASA media guidelines; factual data and U.S. Government works | https://science.nasa.gov/mission/voyager/interstellar-mission/              |
| Heliopause crossing constraints                   | Voyager 1 and Voyager 2                               | NASA/JPL-Caltech Voyager mission team             | NAIF/SPK `10`; `VOYAGER-HP-2012-2018`         | NASA media guidelines; factual data and U.S. Government works | https://www.nasa.gov/solar-system/the-voyage-to-interstellar-space/         |

Main-belt points include schematic density reductions near principal Kirkwood resonances, not
catalogued asteroids. Trojan points are statistical clouds around the stable L4/L5 regions, not
solved orbits. Kuiper Belt and Scattered Disk points are population envelopes. The Scattered
Disk's outer transition is intentionally described as uncertain rather than drawn as a hard
physical wall.

The Oort Cloud is **modeled, indirectly inferred, and not directly observed**. NASA has no direct
image of it; the adopted 2,000–100,000 AU shell is a scale hypothesis used to communicate its
proposed extent. The UI repeats this limitation prominently.

Voyager 1 and Voyager 2 supply only two in-situ cuts through the outer heliosphere. Their measured
termination-shock crossings at about 94 and 84 AU and heliopause crossings near 122 and 119–120 AU
do not define complete spherical surfaces. Exora's translucent heliosphere, termination-shock,
and heliopause shells are explicitly labeled simulated global interpolations. They are normalized
for exploration, vary in reality with solar/interstellar conditions, and are not presented as
photographed or uniformly measured boundaries.

## Planetary subsystem datasets

Retrieved **2026-08-24**. Principal moons use original Blender fields with catalog-based materials. The tables below support authored parent-relative mean orbits, identities,
ring boundaries, resonances, and explanatory environmental layers. All distance readouts preserve
the source values. The 3D overview logarithmically compresses radial distance and independently
exaggerates body size; the disclosure appears beside every subsystem view.

| Dataset / layer                                                      | Systems                                              | Permanent identity / dataset                                                       | Mission / credit                                                                                                      | License / use terms                                                                               | Original URL                                                                                              |
| -------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Planetary Satellite Mean Elements                                    | Earth, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto | Planet NAIF `399`, `499`, `599`, `699`, `799`, `899`, `999`; moon IDs listed below | NASA/JPL Solar System Dynamics; system-specific orbit solutions DE440, MAR097, JUP365, SAT441, URA111, NEP097, PLU060 | NASA/JPL factual data; no additional license asserted                                             | https://ssd.jpl.nasa.gov/sats/elem/                                                                       |
| Planetary Satellite Physical Parameters                              | All moon-bearing systems                             | JPL SSD physical-parameter table; moon IDs listed below                            | NASA/JPL Solar System Dynamics; IAU Working Group on Cartographic Coordinates and Rotational Elements                 | NASA/JPL factual data; source references retained by JPL                                          | https://ssd.jpl.nasa.gov/sats/phys_par/                                                                   |
| Generic satellite SPK ephemerides                                    | Earth through Pluto                                  | Permanent NAIF body codes; current generic satellite kernels                       | NASA Navigation and Ancillary Information Facility                                                                    | NASA/JPL scientific data; kernel provenance and coverage must be inspected before operational use | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/satellites/                                        |
| Ring and moon archive context                                        | Jupiter, Saturn, Uranus, Neptune, Pluto              | NASA PDS Ring-Moon Systems Node                                                    | NASA Planetary Data System; Voyager, Galileo, Cassini, New Horizons, HST                                              | NASA PDS public scientific data; product-specific citations apply                                 | https://pds-rings.seti.org/                                                                               |
| Jupiter ring, moon, plasma-torus, and magnetosphere constraints      | Jupiter                                              | NAIF `599`; Io `501`; Europa `502`; Ganymede `503`; Callisto `504`                 | NASA/JPL-Caltech; Voyager, Galileo, New Horizons                                                                      | NASA media guidelines; U.S. Government work and factual data                                      | https://science.nasa.gov/mission/voyager/fact-sheet/                                                      |
| Io plasma-torus interpretation                                       | Jupiter                                              | Io NAIF `501`                                                                      | NASA Science; Galileo mission context                                                                                 | NASA media guidelines; factual data                                                               | https://science.nasa.gov/jupiter/jupiter-moons/io/facts/                                                  |
| Europa plume candidate locations and maximum reported height         | Jupiter                                              | Europa NAIF `502`; Hubble STIS and Galileo PLS/MAG evidence                        | NASA/ESA/STScI/USGS; Hubble and Galileo teams                                                                         | NASA media guidelines; no imagery redistributed                                                   | https://science.nasa.gov/mission/europa-clipper/europa-exploration-history/                               |
| Europa plume non-detection constraint                                | Jupiter                                              | Europa NAIF `502`; JWST observation                                                | NASA/ESA/CSA; JWST team                                                                                               | NASA media guidelines; factual data                                                               | https://science.nasa.gov/missions/webb/nasas-webb-finds-carbon-source-on-surface-of-jupiters-moon-europa/ |
| Saturn ring shepherding and Phoebe retrograde direction              | Saturn                                               | Saturn `699`; Atlas `615`; Prometheus `616`; Pandora `617`; Phoebe `609`           | NASA/JPL-Caltech; Cassini mission                                                                                     | NASA media guidelines; factual data                                                               | https://science.nasa.gov/wp-content/uploads/2023/09/cassini-arrival-1.pdf                                 |
| Encke Gap, Pan wakes, and Prometheus/Pandora density-wave resonances | Saturn                                               | Pan NAIF `618`; Prometheus `616`; Pandora `617`                                    | NASA/JPL/Space Science Institute; Cassini ISS                                                                         | NASA media guidelines; no imagery redistributed                                                   | https://science.nasa.gov/resource/resonant-effects/                                                       |
| Enceladus plume source and tiger-stripe localization                 | Saturn                                               | Enceladus NAIF `602`; Cassini ISS/CIRS/INMS                                        | NASA/JPL-Caltech/Space Science Institute; Cassini mission                                                             | NASA media guidelines; no imagery redistributed                                                   | https://science.nasa.gov/missions/cassini/cassini-at-enceladus-a-decade-plus-of-discovery/                |
| Uranian epsilon-ring shepherding                                     | Uranus                                               | Uranus `799`; Cordelia `706`; Ophelia `707`                                        | NASA/JPL; Voyager 2                                                                                                   | NASA media guidelines; factual data                                                               | https://science.nasa.gov/uranus/moons/cordelia/                                                           |
| Earth magnetosphere representative extent                            | Earth                                                | Earth NAIF `399`; typical 6–10 Earth-radius dayside boundary                       | NASA Heliophysics                                                                                                     | NASA media guidelines; factual data                                                               | https://science.nasa.gov/heliophysics/focus-areas/magnetosphere-ionosphere/                               |
| Venus induced magnetic field                                         | Venus                                                | Venus NAIF `299`                                                                   | NASA Science; Pioneer Venus, Venus Express, and planetary research context                                            | NASA media guidelines; factual data                                                               | https://science.nasa.gov/venus/venus-facts/                                                               |
| Uranus and Neptune magnetic-field tilt and aurora context            | Uranus, Neptune                                      | Uranus `799`; Neptune `899`; Voyager 2 measurements                                | NASA/JPL-Caltech Voyager mission team                                                                                 | NASA media guidelines; factual data                                                               | https://science.nasa.gov/mission/voyager/fact-sheet/                                                      |
| NAIF integer identity registry                                       | Every subsystem                                      | NAIF IDs Required Reading                                                          | NASA/JPL NAIF                                                                                                         | NASA/JPL documentation                                                                            | https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/naif_ids.html                                       |

Permanent moon codes used by the authored view are: Earth `301`; Mars `401–402`; Jupiter `501–506`,
`508–509`, `514–516`; Saturn `601–611`, `615–618`, `635`; Uranus `701–715`; Neptune `801–808`;
and Pluto `901–905`. Codes are recorded beside each body in `planetary-subsystems.ts`; the UI
exposes them for every principal moon and in immersive mode. The scene is a catalogue display of
mean elements, not a date-specific SPICE evaluation. The local dated-position model for planets is
separate.

No rendered magnetopause is claimed as a live boundary. Dayside/tail extents are representative
mission-era constraints, shown with a wireframe and marked **derived** because solar-wind pressure
changes them continuously. Aurora ovals, plasma density, and plume particles are marked
**simulated**. Enceladus jets are tied to confirmed Cassini south-polar activity; Europa's plume is
marked **tentative**, intermittent, and absent from the cited JWST observation. Unresolved minor
moons receive a low-detail neutral silhouette with no albedo markings or invented terrain.

## Interface typefaces

The interface uses **IBM Plex Sans**, designed by Mike Abbink and Bold Monday for IBM, for text,
and **Geist Mono**, designed by Vercel with Basement Studio, for numeric readings and keys. Both
are licensed under the SIL Open Font License 1.1 and shipped by `@fontsource-variable/ibm-plex-sans`
and `@fontsource-variable/geist-mono`. Each package's `wght.css` declares the upright variable face,
split by Unicode range. Hashed WOFF2 assets are served from the app's own origin and cached offline;
no font service is contacted. See each package's `LICENSE`.

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

The filename carries the catalogue version, so `_headers` can serve it `immutable`. Regenerating
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

## Bundled Solar System orbital states

Retrieved on **2026-11-15** from NASA/JPL Horizons API 1.2. The browser bundles
`apps/website/src/data/solar-orbits.json` (365-day heliocentric ecliptic J2000 state samples) and
computes **derived** positions with blended two-body propagation. There is no live ephemeris
request or server cache. The data retain exact source URLs, anchor target names, and JPL solution
identifiers. Independent body-center comparisons are in `solar-orbits-fixtures.json`.

Earth uses Earth–Moon barycenter anchors (3); Pluto uses system-barycenter anchors (9). Their
rendered body IDs remain 399 and 999. The other eleven targets use body-center anchors.
The supported interval is UTC 1900–2100. The worst error in 65 sampled comparisons is
0.000331346 AU (about 49,569 km); this is not a guaranteed bound. See
[the method, validation and regeneration commands](docs/local-solar-positions.md).
Credit: NASA/JPL-Caltech Solar System Dynamics Group. Use terms: NASA/JPL factual scientific
data; [JPL use policy](https://www.jpl.nasa.gov/jpl-image-use-policy/).
The following table records body identities and source context; exact build-time requests,
including the barycenter substitutions, are in the bundled data.

| Body     | Mission / archive                        | Permanent NAIF / SPK ID        | Original URL                                                                          |
| -------- | ---------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| Mercury  | JPL Horizons major-body ephemeris        | NAIF/SPK `199`                 | https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=%27199%27               |
| Venus    | JPL Horizons major-body ephemeris        | NAIF/SPK `299`                 | https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=%27299%27               |
| Earth    | JPL Horizons major-body ephemeris        | NAIF/SPK `399`                 | https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=%27399%27               |
| Mars     | JPL Horizons major-body ephemeris        | NAIF/SPK `499`                 | https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=%27499%27               |
| Jupiter  | JPL Horizons major-body ephemeris        | NAIF/SPK `599`                 | https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=%27599%27               |
| Saturn   | JPL Horizons major-body ephemeris        | NAIF/SPK `699`                 | https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=%27699%27               |
| Uranus   | JPL Horizons major-body ephemeris        | NAIF/SPK `799`                 | https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=%27799%27               |
| Neptune  | JPL Horizons major-body ephemeris        | NAIF/SPK `899`                 | https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=%27899%27               |
| Pluto    | JPL Horizons major-body ephemeris        | NAIF/SPK `999`                 | https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=%27999%27               |
| Ceres    | JPL Horizons small-body orbital solution | NAIF `2000001`; SPK `20000001` | https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=%27DES%3D20000001%3B%27 |
| Eris     | JPL Horizons small-body orbital solution | NAIF/SPK `20136199`            | https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=%27DES%3D20136199%3B%27 |
| Haumea   | JPL Horizons small-body orbital solution | NAIF/SPK `20136108`            | https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=%27DES%3D20136108%3B%27 |
| Makemake | JPL Horizons small-body orbital solution | NAIF/SPK `20136472`            | https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND=%27DES%3D20136472%3B%27 |

## Constellation boundaries

`apps/website/src/constellation-boundaries.ts` is the complete 357-row table from **CDS catalogue
VI/42**, _Identification of a Constellation From Position_ (Roman 1987, PASP 99, 695), which
rearranges the IAU boundaries of Delporte (1930) so a position can be assigned to its
constellation by a single ordered scan.

| Field       | Value                                                       |
| ----------- | ----------------------------------------------------------- |
| Catalogue   | VI/42, CDS Strasbourg                                       |
| Source file | `https://cdsarc.cds.unistra.fr/ftp/VI/42/data.dat`          |
| Retrieved   | 2026-09-28                                                  |
| Equinox     | B1875 (positions are precessed from J2000 before lookup)    |
| Changes     | None to the values; reformatted from fixed-width text to TS |

The row corrected by Nancy G. Roman on 1999-12-30 (#229) is included as distributed.

## Original catalog portraits

`textures/catalog-portraits.webp` contains 40 original Blender portraits in eight columns. The first 35 depict Solar System destinations. The remaining five supply recipe-tinted catalog and Forge thumbnails. The swatches, surface noise, ring projections and lighting are defined in `art/bake-catalog.py`.

## Solar System planet models

The eight orbit globes use NASA planetary visualizations. Exora refits the mapped meshes to
their source ellipsoids in Blender, preserves the source UVs, and renders the eight catalog
portraits in `textures/solar-planets.webp` from the exported geometry and materials.
The atmospheric maps depict representative cloud patterns and colors. They are static
visualizations. Saturn uses the source ring texture. The faint rings of the other giants
use the subsystem catalog's radial boundaries and illustrative opacities.

| Shipped model                                                    | Source                                                                             |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `models/planets/mercury.glb`, `models/planets/mercury-small.glb` | [NASA VTAD · Mercury](https://science.nasa.gov/resource/mercury-3d-model/)         |
| `models/planets/venus.glb`, `models/planets/venus-small.glb`     | [NASA VTAD · Venus](https://science.nasa.gov/resource/venus-3d-model/)             |
| `models/planets/earth.glb`, `models/planets/earth-small.glb`     | [NASA VTAD · Earth](https://science.nasa.gov/resource/earth-with-clouds-3d-model/) |
| `models/planets/mars.glb`, `models/planets/mars-small.glb`       | [NASA JPL-Caltech · Mars](https://science.nasa.gov/resource/planet-mars-3d-model/) |
| `models/planets/jupiter.glb`, `models/planets/jupiter-small.glb` | [NASA VTAD · Jupiter](https://science.nasa.gov/resource/jupiter-3d-model/)         |
| `models/planets/saturn.glb`, `models/planets/saturn-small.glb`   | [NASA VTAD · Saturn](https://science.nasa.gov/resource/saturn-3d-model/)           |
| `models/planets/uranus.glb`, `models/planets/uranus-small.glb`   | [NASA VTAD · Uranus](https://science.nasa.gov/resource/uranus-3d-model/)           |
| `models/planets/neptune.glb`, `models/planets/neptune-small.glb` | [NASA VTAD · Neptune](https://science.nasa.gov/resource/neptune-3d-model/)         |

Regenerate the models and portraits with
`blender -b --python-exit-code 1 -P art/model-solar-planets.py -- /path/to/source-cache`.
The script downloads the source GLBs on first use. NASA's
[media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) apply.

## Original Blender surface fields

The following linear RGB data maps are original Exora artwork baked in Blender
with `art/bake-world-fields.py`. Each field is sampled on the unit sphere so
the longitude wraps and the poles converge. The channels have distinct uses.

| Map                               | Red                   | Green           | Blue                |
| --------------------------------- | --------------------- | --------------- | ------------------- |
| `textures/fields/lithosphere.png` | Continental elevation | Mountain ridges | Mineral grain       |
| `textures/fields/convection.png`  | Cloud density         | Zonal shear     | Turbulent filaments |
| `textures/fields/photosphere.png` | Convection cells      | Active regions  | Bright plage        |

## Ground materials

Exora packs the tangent-space normals and luminance of these 1k Poly Haven scans in Blender
with `art/pack-terrain-scans.py`. The local geology supplies the surface colors. The scans are
distributed under [CC0](https://polyhaven.com/license).

| File                          | Source                                                 | Artists                           |
| ----------------------------- | ------------------------------------------------------ | --------------------------------- |
| `textures/terrain/scree.webp` | [Rocky Gravel](https://polyhaven.com/a/rocky_gravel)   | Dimitrios Savva and Dario Barresi |
| `textures/terrain/sand.webp`  | [Gravelly Sand](https://polyhaven.com/a/gravelly_sand) | Dario Barresi                     |
| `textures/terrain/frost.webp` | [Snow 03](https://polyhaven.com/a/snow_03)             | Rob Tuytel                        |
| `textures/terrain/cliff.webp` | [Rock Face 04](https://polyhaven.com/a/rock_face_04)   | Dimitrios Savva                   |

## Original Blender small bodies

These procedural studies are original Exora models. Run `art/model-small-bodies.py`
in Blender to regenerate the geometry and vertex colors. Each GLB contains one
centered mesh with its material embedded.

| Model                        | Form                                            |
| ---------------------------- | ----------------------------------------------- |
| `models/impact-fragment.glb` | Pitted silicate with raised impact rims         |
| `models/comet-nucleus.glb`   | Dark bilobed nucleus with a narrow neck         |
| `models/ice-fragment.glb`    | Elongated ice-rich fragment with shallow basins |

`models/terrain-outcrops.glb` contains five original Blender meshes for local
exploration. The pebble, boulder, slab, spire, and ice shard use clipped rock faces and
vertex pigment. Regenerate them with `art/model-terrain-outcrops.py` in Blender.

`art/sculpt-landmarks.py` builds three original local formations in Blender.
`models/sandstone-window.glb` contains a wind-cut arch with a through passage.
`models/pressure-ice.glb` contains tilted ice plates. `models/basalt-joints.glb`
contains fractured columns of cooled lava.

The accretion disk uses an original 1024 × 256 Blender bake, `textures/fields/accretion.png`. The shader reads azimuth along the horizontal axis and disk radius along the vertical axis. Red controls filament density, green traces compression bands, and blue varies local emission. Regenerate the data with `art/bake-accretion.py` from Blender's Python Console.

The original cloud billows in `textures/fields/billows.png` store lobe height and horizontal gradients for gas and ice giants. Regenerate the tile with `art/bake-cloud-billows.py` in Blender.

The original `models/alpine-fir.glb` uses layered boughs and an embedded needle-spray atlas for the forests on Earth. Regenerate it in Blender with `art/sculpt-alpine-fir.py`.
