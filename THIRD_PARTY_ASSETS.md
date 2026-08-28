# Third-Party Asset Provenance

## Known Solar System surface maps

Known bodies do not use Exora's inferred exoplanet color at orbital distance when an authoritative
global mosaic exists. These equirectangular maps are sampled directly on the sphere, then lit by
Exora's day/night, atmosphere, cloud, and ring passes. The map is never claimed to be live imagery:
it is the cited mission mosaic prepared for planetary visualization.

Where a mission product exists at a resolution the renderer can actually spend, Exora resamples the
published full-resolution mosaic itself rather than shipping a small browse derivative. Preparation
for every such file is identical and is recorded once here: the source GeoTIFF is downloaded from
the USGS Astrogeology PDS Annex (`asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/`) or from
NASA's Photojournal asset host, then resampled once to the shipped pixel size with a Lanczos-3
kernel and encoded as MozJPEG. No sharpening, level stretch, gap fill, tint, or colourisation is
applied at any point, so a shipped map differs from its source only in sample count and in JPEG
quantisation.

| Body    | Shipped file                        | Source data / preparation                                       | Source page                                                                    |
| ------- | ----------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Mercury | `textures/solar-system/mercury.jpg` | MESSENGER MDIS 250 m global mosaic / USGS Astrogeology          | `astrogeology.usgs.gov/search/map/mercury_messenger_mdis_global_mosaic_250m`   |
| Venus   | `textures/solar-system/venus.jpg`   | Magellan radar / NASA JPL-Caltech                               | `science.nasa.gov/3d-resources/venus/`                                         |
| Earth   | `textures/solar-system/earth.jpg`   | MODIS Blue Marble / NASA Goddard                                | `visibleearth.nasa.gov/images/57723/the-blue-marble`                           |
| Mars    | `textures/solar-system/mars.jpg`    | Viking imagery / USGS / NASA JPL-Caltech                        | `science.nasa.gov/3d-resources/mars/`                                          |
| Jupiter | `textures/solar-system/jupiter.jpg` | Cassini ISS cylindrical map (PIA07782) / NASA JPL-Caltech / SSI | `science.nasa.gov/photojournal/cassinis-best-maps-of-jupiter-cylindrical-map/` |
| Saturn  | `textures/solar-system/saturn.jpg`  | NASA/JPL Solar System Simulator visualization                   | `science.nasa.gov/3d-resources/saturn/`                                        |
| Neptune | `textures/solar-system/neptune.jpg` | NASA/JPL Solar System Simulator visualization                   | `science.nasa.gov/3d-resources/neptune/`                                       |
| Pluto   | `textures/solar-system/pluto.jpg`   | New Horizons MVIC global color map / NASA/JHUAPL                | `science.nasa.gov/resource/pluto-global-color-map/`                            |

Mobile and Quest routes use 1024×512 JPEG derivatives of only the source mosaics larger than
900 kB. They preserve the source pixels and coverage with no retouching: `callisto-mobile.jpg`,
`dione-mobile.jpg`, `enceladus-mobile.jpg`, `europa-mobile.jpg`, `ganymede-mobile.jpg`,
`mars-mobile.jpg`, `mercury-mobile.jpg`, `mimas-mobile.jpg`, `rhea-mobile.jpg`,
`tethys-mobile.jpg`, and `venus-mobile.jpg`.

### Principal moon mosaics

The 21 principal moons below are the complete set for which NASA's current public visualization
library provides a prepared global mission map. Nine of them — the four Galilean moons, four of
Saturn's icy moons, and Triton — are resampled from the published full-resolution USGS Astrogeology
controlled mosaics using the preparation described above. The Moon uses the 2025 LRO color map made
specifically for 3D rendering; the remaining files come from NASA's mirrored 3D Resources set.
Mission coverage gaps remain visible instead of being filled with invented geography: Triton's
unimaged northern hemisphere, Europa's unimaged polar caps, and Ganymede's polar seams read as
absent data rather than as terrain.

| System  | Shipped files                                                          | Source data / preparation                                             | Source pages                                                                 |
| ------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Earth   | `moon.jpg`                                                             | LRO WAC 2025 global color map / NASA GSFC SVS                         | `svs.gsfc.nasa.gov/4720/`                                                    |
| Mars    | `phobos.jpg`, `deimos.jpg`                                             | Viking mission maps / NASA JPL-Caltech                                | `science.nasa.gov/3d-resources/`                                             |
| Jupiter | `io.jpg`, `europa.jpg`, `ganymede.jpg`, `callisto.jpg`                 | Galileo SSI and Voyager controlled mosaics / USGS Astrogeology        | `astrogeology.usgs.gov/search/map/` (per-body slugs below)                   |
| Saturn  | `enceladus.jpg`, `tethys.jpg`, `dione.jpg`, `rhea.jpg`                 | Cassini ISS (Voyager gap fill) controlled mosaics / USGS Astrogeology | `astrogeology.usgs.gov/search/map/` (per-body slugs below)                   |
| Saturn  | `mimas.jpg`                                                            | Cassini ISS semi-controlled basemap / DLR                             | `science.nasa.gov/resource/mimas-global-map-june-2017/`                      |
| Saturn  | `titan.jpg`, `iapetus.jpg`                                             | Cassini mission mosaics / NASA JPL-Caltech SSI                        | `science.nasa.gov/3d-resources/`                                             |
| Uranus  | `miranda.jpg`, `ariel.jpg`, `umbriel.jpg`, `titania.jpg`, `oberon.jpg` | Voyager 2 mission mosaics / NASA JPL-Caltech                          | `science.nasa.gov/3d-resources/`                                             |
| Neptune | `triton.jpg`                                                           | Voyager 2 global color mosaic / USGS Astrogeology                     | `astrogeology.usgs.gov/search/map/triton_voyager_2_global_color_mosaic_600m` |
| Pluto   | `charon.jpg`                                                           | New Horizons mission mosaic / NASA JHUAPL SwRI                        | `science.nasa.gov/3d-resources/`                                             |

The USGS Astrogeology mosaics are the source products behind each Astropedia entry, retrieved from
the PDS Annex and resampled as described above. Every one is a US Government work published without
additional licence terms; Astropedia asks users to cite the product authors, which the per-body
credit line in `solar-moons.ts` does.

| Shipped file    | Astropedia product                                       | Source GeoTIFF under `mosaic/`                           | Shipped size |
| --------------- | -------------------------------------------------------- | -------------------------------------------------------- | ------------ |
| `io.jpg`        | `io_galileo_ssi_global_color_merge_mosaic_1km`           | `Io_Galileo_SSI_Global_Mosaic_ClrMerge_1km.tif`          | 4096 × 2048  |
| `europa.jpg`    | `europa_voyager_galileo_ssi_global_mosaic_500m`          | `Europa_Voyager_GalileoSSI_global_mosaic_500m.tif`       | 4096 × 2048  |
| `ganymede.jpg`  | `ganymede_voyager_galileo_ssi_color_global_mosaic_1_4km` | `Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m.tif` | 4096 × 2048  |
| `callisto.jpg`  | `callisto_galileo_voyager_global_mosaic_1km`             | `Callisto_Voyager_GalileoSSI_global_mosaic_1km.tif`      | 4096 × 2048  |
| `enceladus.jpg` | `enceladus_cassini_global_mosaic_110m`                   | `Enceladus_Cassini_mosaic_global_110m.tif`               | 4096 × 2048  |
| `tethys.jpg`    | `tethys_cassini_global_mosaic_293m`                      | `Tethys_Cassini_mosaic_global_293m.tif`                  | 4096 × 2048  |
| `dione.jpg`     | `dione_cassini_voyager_global_mosaic_154m`               | `Dione_Cassini_Voyager_mosaic_global_154m.tif`           | 4096 × 2048  |
| `rhea.jpg`      | `rhea_cassini_voyager_global_mosaic_417m`                | `Rhea_Cassini_Voyager_mosaic_global_417m.tif`            | 4096 × 2048  |
| `triton.jpg`    | `triton_voyager_2_global_color_mosaic_600m`              | `Triton_Voyager2_ClrMosaic_GlobalFill_600m.tif`          | 4096 × 2048  |

Mimas is the one moon in that group with no Astropedia entry of its own. Its map is the DLR
semi-controlled Cassini ISS basemap `MI_170630_DLR_basemap.tif` (5760 x 2880) from
`mosaic/Mimas/Cassini_DLR_Mimas.zip` in the same PDS Annex, produced by Roatsch et al. and
released by NASA/JPL-Caltech as the June 2017 Mimas global map. It replaces a 3D Resources file
whose northern hemisphere and equatorial band were blank.

Mercury's map is the monochrome MESSENGER MDIS 250 m global mosaic
(`Mercury_MESSENGER_mosaic_global_250m_2013.tif`, 61324 x 30662) from the same PDS Annex,
resampled to 4096 x 2048. The MDIS enhanced-colour mosaic was rejected: its colour is stretched
to separate surface units, not to reproduce what an observer would see.

Jupiter's map is Cassini's 2000 flyby cylindrical mosaic, retrieved as the full-resolution
Photojournal TIFF for PIA07782 and resampled to its native 3600 × 1800. Its unimaged polar bands
are left at the neutral value the published product carries.

The NASA 3D Resources copies were taken from NASA's public `NASA-3D-Resources` GitHub mirror.
NASA states that the hub's assets are free to download and use subject to the NASA Images and
Media Usage Guidelines. The Mercury browse mosaic is published by USGS as public domain. Uranus
has no comparable resolved global color mosaic, so Exora keeps its physically tuned ice-giant
shader instead of inventing surface geography. Saturn and Neptune keep their JPL Solar System
Simulator maps: no higher-resolution global cylindrical map of either planet is published, and the
Hubble OPAL global maps that do exist carry ring-shadow gaps that would render as holes.

Two moons and one dwarf-planet satellite deliberately keep their lower-resolution NASA 3D Resources
map. Iapetus's USGS mosaic
is photometrically normalised, which removes the leading/trailing albedo dichotomy that is the
body's defining feature; Titan's Cassini ISS mosaic images the surface through the 938 nm methane
window rather than the orange haze an observer would see; Charon's USGS mosaic leaves the entire
southern hemisphere unimaged, where the shipped map is gap-filled and in colour.

### Remaining dwarf planets

Retrieval date for every row in this section: **2026-08-23**. JPL's permanent asteroid-system
SPK identifiers use the current eight-digit scheme; Ceres also retains legacy NAIF body code
`2000001`, which remains present in generic SPICE kernels. The catalog records both rather than
silently treating one numbering scheme as the other.

| Body / data                              | Mission or archive                                                       | Shipped asset / dataset                                                                                                                                            | Permanent NAIF / SPK ID        | Credit                                               | License / use terms                                                                             | Original URL                                                                                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ceres global image mosaic                | Dawn FC, HAMO / USGS Astropedia                                          | `textures/solar-system/ceres.jpg` (1024×512 browse derivative; SHA-256 `12fe5bf219161b4cc39a9d72040f7400b57b8ae9dd6cb8073ab1b7b26403e73c`)                         | NAIF `2000001`; SPK `20000001` | NASA/JPL-Caltech/UCLA/MPS/DLR/IDA; USGS Astrogeology | US Government work; Astropedia asks users to cite the product authors                           | https://astrogeology.usgs.gov/ckan/dataset/6ad84c9a-1fad-4869-b4f6-b52c5c2ace36/resource/9f757a65-8d8a-4349-a72d-8062387574b3/download/ceres_dawn_fc_dlr_global_feb2016_1024.jpg  |
| Ceres global topography                  | Dawn FC2, HAMO stereo-photogrammetry / DLR / USGS Astropedia             | `textures/solar-system/ceres-topography.jpg` (1024×512 browse derivative of 137 m DTM; SHA-256 `3f5b7d16ef80f155fd4c776a3f6cfab0e421372c1466aea52a689c10e593d4d7`) | NAIF `2000001`; SPK `20000001` | F. Preusker et al.; DLR; Dawn FC2; USGS Astrogeology | US Government work; cite Preusker et al. (2016) and dataset `DAWN-A-FC2-5-CERESHAMODTMSPG-V1.0` | https://astrogeology.usgs.gov/ckan/dataset/1a165f71-5f31-44b6-b770-63e53b53902e/resource/a407b289-19ab-451d-bd3d-e423b9949a08/download/ceres_dawn_fc_hamo_dtm_dlr_global_1024.jpg |
| Ceres physical and orbital parameters    | JPL SSD planetary parameters; JPL SBDB API 1.3                           | Authored catalog values; no binary asset                                                                                                                           | NAIF `2000001`; SPK `20000001` | NASA/JPL Solar System Dynamics                       | NASA/JPL data; no additional license asserted                                                   | https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=1&phys-par=1&full-prec=1                                                                                                               |
| Eris physical and orbital parameters     | JPL SSD planetary parameters; JPL SBDB API 1.3                           | Authored catalog values; no surface asset                                                                                                                          | SPK `20136199`                 | NASA/JPL Solar System Dynamics                       | NASA/JPL data; no additional license asserted                                                   | https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=136199&phys-par=1&full-prec=1                                                                                                          |
| Haumea physical and orbital parameters   | JPL SSD planetary parameters; JPL SBDB API 1.3; 2017 stellar occultation | Authored catalog values and measured triaxial dimensions; no surface asset                                                                                         | SPK `20136108`                 | NASA/JPL SSD; Ortiz et al.                           | Catalog facts only; source publications cited                                                   | https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=136108&phys-par=1&full-prec=1                                                                                                          |
| Makemake physical and orbital parameters | JPL SSD planetary parameters; JPL SBDB API 1.3                           | Authored catalog values; no surface asset                                                                                                                          | SPK `20136472`                 | NASA/JPL Solar System Dynamics                       | NASA/JPL data; no additional license asserted                                                   | https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=136472&phys-par=1&full-prec=1                                                                                                          |

Ceres's displayed topography is sampled from the Dawn HAMO DTM at the body's measured
peak-to-peak relief scale. It is not procedural terrain. The source mosaic contains varying
illumination, and Dawn's south-polar imaging/derived-crater coverage is incomplete; the renderer
does not patch those gaps. Eris and Makemake have never been resolved as
global surfaces. Haumea's occultation-constrained proportions are measured, but its visible
material is still only a neutral water-ice treatment. The UI labels all of these limitations at
the point of use.

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

Retrieved **2026-08-24**. These views ship no new imagery: mapped principal moons reuse the mission
mosaics credited above. The tables below support authored parent-relative mean orbits, identities,
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
mean elements, not a date-specific SPICE evaluation. Part 7's cached Horizons mode is intentionally
separate.

No rendered magnetopause is claimed as a live boundary. Dayside/tail extents are representative
mission-era constraints, shown with a wireframe and marked **derived** because solar-wind pressure
changes them continuously. Aurora ovals, plasma density, and plume particles are marked
**simulated**. Enceladus jets are tied to confirmed Cassini south-polar activity; Europa's plume is
marked **tentative**, intermittent, and absent from the cited JWST observation. Unresolved minor
moons receive a low-detail neutral silhouette with no albedo markings or invented terrain.

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

The ten shipped files are `textures/basalt/normal.ktx2`, `textures/basalt/roughness.ktx2`,
`textures/cracked/normal.ktx2`, `textures/cracked/roughness.ktx2`,
`textures/granite/normal.ktx2`, `textures/granite/roughness.ktx2`,
`textures/ice/normal.ktx2`, `textures/ice/roughness.ktx2`,
`textures/regolith/normal.ktx2`, and `textures/regolith/roughness.ktx2`.

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

## Live Solar System ephemerides

Retrieved and contract-checked on **2026-08-24**. No ephemeris file is shipped to the browser.
Exora's backend requests geometric heliocentric state vectors from the NASA/JPL Horizons API,
validates signature source `NASA/JPL Horizons API` and payload version `1.2`, then caches the
normalized answer. Every returned vector retains the permanent identity and Horizons' own
major-body kernel or small-body orbital-solution label (for example `DE441` or `JPL#103`). Credit:
NASA/JPL-Caltech Solar System Dynamics Group. Use terms: NASA/JPL factual scientific data; see the
[JPL Image Use Policy](https://www.jpl.nasa.gov/jpl-image-use-policy/). Original API documentation:
https://ssd-api.jpl.nasa.gov/doc/horizons.html.

All requests set center `500@10` (Sun body center), `EPHEM_TYPE=VECTORS`, `OUT_UNITS=AU-D`,
`REF_PLANE=ECLIPTIC`, `REF_SYSTEM=ICRF`, `VEC_CORR=NONE`, and `VEC_TABLE=2`. The UTC epoch is the
visitor's requested time. The links below are the original dynamic dataset URLs up to that epoch
parameter; Exora supplies `TLIST` server-side and never exposes JPL as a browser dependency.

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

The exact requested snapshot is measured/model-solved JPL data. Playback away from that anchor is
an explicitly labelled two-body propagation using the returned position and velocity; it is not
presented as a second Horizons solution. The orbit ribbons remain the existing simplified catalog
orbits and are labelled separately. If Horizons is unavailable, only a still-valid stale cache
entry for the exact target and epoch may be served, and the interface marks it `STALE CACHE`.
