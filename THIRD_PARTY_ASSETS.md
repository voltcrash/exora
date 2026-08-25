# Third-Party Asset Provenance

## Solar System mission layers

Retrieved 2026-08-24. Exora ships no spacecraft models or mission imagery for these views. The
twelve spacecraft paths are requested server-side from NASA/JPL Horizons API 1.2 using the
spacecraft's permanent NAIF/SPK code, the Sun (`500@10`) as center, geometric ecliptic-J2000
vectors, TDB sample times, and AU/day units. The allowlist is Pioneer 10 (`-23`), Pioneer 11
(`-24`), Voyager 1 (`-31`), Voyager 2 (`-32`), Juno (`-61`), OSIRIS-REx (`-64`), Galileo
Orbiter (`-77`), Cassini (`-82`), Parker Solar Probe (`-96`), New Horizons (`-98`), Dawn
(`-203`), and Rosetta (`-226`). Source: https://ssd.jpl.nasa.gov/horizons/; permanent ID source:
https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/naif_ids.html.

The browser receives at most 400 validated path samples through Exora's API and never calls JPL
directly. Horizons documents that spacecraft trajectories originate with mission navigation teams
and may be updated on weekly or monthly schedules rather than in real time. Archived spacecraft
solutions can also be offset from modern target-body ephemerides. The interface therefore prints
the returned solution identifier and retrieval/cache status, uses no interpolated event claim,
and snaps milestone markers only to the nearest returned sample. Its radial view is explicitly
log-compressed and is not a linear distance chart.

Apollo landing points reproduce the six LROC landing-site coordinates from NASA/Arizona State
University (`https://www.lroc.asu.edu/featured_sites`) on Moon anchor NAIF/SPK `301`. The Mars
collection reproduces the reported landing coordinates for the principal successful NASA surface
missions Viking 1/2, Pathfinder/Sojourner, Spirit, Opportunity, Phoenix, Curiosity, InSight, and
Perseverance from the NASA Mars Exploration Program
(`https://science.nasa.gov/mars/exploration/`) on Mars anchor NAIF/SPK `499`. Spacecraft codes are
shown only where NAIF publishes a permanent code. Marker sizes are exaggerated; the neutral
Moon/Mars context sphere is neither mission imagery nor a high-resolution terrain product.

## Irregular-body model runtime

`@babylonjs/loaders` 9.22.1 is used to load attributed NASA/PDS OBJ and GLB shape assets and the
plate-preserving GLB derivatives of NAIF Digital Shape Kernels. It is distributed under
Apache-2.0. The loader is registered dynamically, so format code is fetched only for a selected
body. The dependency itself contributes no scientific geometry; every model, map, and DSK source
must have its own row below before it can ship. The conversion and validation contract is recorded
in `docs/irregular-body-shape-models.md`.

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

## Mission asteroids

Retrieved 2026-08-23. Physical and osculating orbital parameters for the authored collection come
from the NASA/JPL Small-Body Database API **1.3**, requested with `phys-par=1` and full precision.
The permanent JPL SPK identifiers stored with each record are `20000004` (Vesta), `20101955`
(Bennu), `20162173` (Ryugu), `20000433` (Eros), `20025143` (Itokawa), `20000243` (Ida),
`20065803` (Didymos system barycenter), `20000016` (Psyche), and `20099942` (Apophis). The
exceptional Galileo-era NAIF identifiers `2431010` and `2431011` identify Ida and Dactyl;
Didymos-body and Dimorphos identifiers are `920065803` and `120065803`. Source endpoint:
https://ssd-api.jpl.nasa.gov/sbdb.api.

| Shipped asset             | Source / mission                                                                          | Credit                                                                 | Permanent identity                          | License / citation                                                        | SHA-256                                                            | Original URL                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vesta-dawn-a.stl`        | NASA 3D Resources, Dawn-derived Vesta shape, 800,000 plates                               | NASA/JPL-Caltech/UCLA/MPS/DLR/IDA                                      | NAIF `2000004`; SPK `20000004`              | NASA media guidelines; U.S. Government work, free of copyright            | `a20fbfc9378398fd157ad0421ceead4dff277f5d545aa7c86d7e14eaa160fe46` | https://github.com/nasa/NASA-3D-Resources/blob/master/3D%20Printing/Asteroid%204%20Vesta%20(A)/Asteroid%204%20Vesta%20(A).stl                                       |
| `bennu-spo-v54.obj`       | NASA PDS OSIRIS-REx Altimetry, combined SPC/OLA global model v54, 12,288 plates           | M. Daly, O. Barnouin, R. Espiritu, D. Lauretta and the OSIRIS-REx team | NAIF `2101955`; SPK `20101955`              | NASA PDS public data; cite DOI `10.26033/pzcf-qs69`                       | `16bfb2cb054efce787800f544468ba01e4d4ab005d015989fb5396a8d58307b4` | https://sbnarchive.psi.edu/pds4/orex/orex.altimetry/data_derived_altimetry_global_models/global_digital_terrain_models/SPOv54/g_12620mm_spo_obj_0000n00000_v054.obj |
| `bennu-spo-v54-49k.obj`   | NASA PDS OSIRIS-REx Altimetry, combined SPC/OLA global model v54, 49,152 plates           | M. Daly, O. Barnouin, R. Espiritu, D. Lauretta and the OSIRIS-REx team | NAIF `2101955`; SPK `20101955`              | NASA PDS public data; cite DOI `10.26033/pzcf-qs69`                       | `7f7d91d049874d76e81c350e3567a141d54f58f68d4516684176fbf7bb64b2e2` | https://sbnarchive.psi.edu/pds4/orex/orex.altimetry/data_derived_altimetry_global_models/global_digital_terrain_models/SPOv54/g_06320mm_spo_obj_0000n00000_v054.obj |
| `ryugu-sfm-49k.obj`       | JAXA DARTS Hayabusa2 SFM v20180804, 49,152 plates                                         | JAXA, University of Aizu, Kobe University; Watanabe et al. (2019)      | NAIF `2162173`; SPK `20162173`              | JAXA DARTS scientific data, provided as-is; publication citation required | `7d66c54b3e68253b27918a82e32c4b8bffc0702e016e036bc5d0eb334c8d9962` | https://data.darts.isas.jaxa.jp/pub/hayabusa2/paper/Watanabe_2019/SHAPE_SFM_49k_v20180804.obj                                                                       |
| `eros-near.obj`           | NASA PDS Gaskell Eros V1.1, NEAR MSI 64q vertex/plate model, 49,152 plates                | Robert Gaskell; NEAR MSI; lossless OBJ conversion by Exora             | NAIF `2000433`; SPK `20000433`              | NASA PDS public data; cite `urn:nasa:pds:gaskell.ast-eros.shape-model`    | `da31d242d836a8c175a8e141aed7e07ed2e76635e2f6b2aaa6851edb11598b9f` | https://sbnarchive.psi.edu/pds4/non_mission/gaskell.ast-eros.shape-model_V1_1/data/vertex/ver64q.tab                                                                |
| `itokawa-hayabusa.obj`    | NASA PDS Gaskell Itokawa V1.1, Hayabusa AMICA 64q vertex/plate model, 49,152 plates       | R. Gaskell et al.; Hayabusa AMICA; lossless OBJ conversion by Exora    | NAIF `2025143`; SPK `20025143`              | NASA PDS public data; cite `urn:nasa:pds:gaskell.ast-itokawa.shape-model` | `c948399e83c351ce83d9fc932a9bce6b25672159cdb3e71a4d551db9616412db` | https://sbnarchive.psi.edu/pds4/non_mission/gaskell.ast-itokawa.shape-model_V1_1/data/vertex/ver64q.tab                                                             |
| `ida-galileo.obj`         | NASA PDS Thomas optical radial model from Galileo SSI, converted sample-for-sample to OBJ | P. C. Thomas et al.; Galileo SSI; conversion by Exora                  | NAIF `2431010`; SPK `20000243`              | NASA PDS public data; cite DOI `10.26033/g5e0-kh52`                       | `77391dc4ced5cd40b1d1be9be5231caeaea90f608f7ee52b543751fd4267cdf3` | https://sbnarchive.psi.edu/pds4/non_mission/ast-sat.thomas.shape-models_V1_0/data/243ida.tab                                                                        |
| `didymos-dart-v003.obj`   | NASA PDS DART final Didymos global SPC v003, 49,152 plates                                | DART Altimetry Working Group; Daly, Barnouin, Ernst et al.             | NAIF `920065803`; SPK barycenter `20065803` | NASA PDS public data; cite DOI `10.26007/bm57-x327`                       | `ac1f51b06cedcf197d7df88888be729255ef604137a3157219e93a9bcd5115a6` | https://pdssbn.astro.umd.edu/holdings/pds4-dart_shapemodel-v1.0/data_derived_didymos_model_v003/didymos_g_9309mm_spc_obj_0000n00000_v003.obj                        |
| `dimorphos-dart-v004.obj` | NASA PDS DART final pre-impact Dimorphos global SPC v004, 49,152 plates                   | DART Altimetry Working Group; Daly, Barnouin, Ernst et al.             | NAIF / SPK `120065803`                      | NASA PDS public data; cite DOI `10.26007/0nss-vd15`                       | `134bbaf72bf8f6505d67cbcfd695708b7cf64ec6e27de95775914c93efbeb487` | https://pdssbn.astro.umd.edu/holdings/pds4-dart_shapemodel-v1.0/data_derived_dimorphos_model_v004/dimorphos_g_1940mm_spc_obj_0000n00000_v004.obj                    |

`scripts/convert-pds-radial-grid-to-obj.mjs` documents the Ida conversion. It converts every
archived latitude/longitude/radius sample to Cartesian coordinates and joins adjacent samples;
it does not interpolate, smooth, decimate, or invent vertices. The DART products are the archived
OBJ sources used to generate their corresponding NAIF DSKs, so no DSK plate conversion is needed
in the browser. `scripts/convert-pds-vertex-plate-to-obj.mjs` preserves every indexed Cartesian
vertex and triangular plate in the archived Eros and Itokawa tables. The previously considered
NASA 3D-printing files were intentionally rejected because they contain separated printable
hemispheres rather than flight-ready complete-body geometry. `scripts/normalize-pds-obj.mjs`
changes only fixed-width whitespace and line
endings in archived OBJ vertex/face records so Babylon can parse them; vertex values and plate
indices remain token-for-token identical. The SHA-256 values above describe the normalized files
that ship.

No mission image is wrapped onto these models. The neutral materials preserve shape without
claiming global color coverage. Dactyl is too sparsely resolved for a detailed model and is shown
only as a measured-dimensions silhouette. Psyche has not yet been visited and Apophis has not yet
been visited by OSIRIS-APEX; their current views are explicitly dimensions-only. Apophis also
rotates non-principally, so Exora does not animate it as a simple single-axis rotator. Dimorphos
uses the final **pre-impact** v004 shape; its post-impact rotation/orbit value is labeled separately.
The current JPL min/nominal/max 2029 Apophis close-approach solution is presented numerically and
is never drawn as a false impact corridor.

## Landmark comets

Retrieved 2026-08-23. Orbital elements, effective diameters, albedos, and reported rotation
periods are authored from NASA/JPL SBDB API **1.3** `phys-par=1` responses for permanent SPK
identifiers `1000036` (1P/Halley), `1000012` (67P), `1000093` (9P), `1000107` (81P), `1000005`
(19P), and `1000132` (Hale–Bopp). Shoemaker–Levy 9 is a disrupted multi-object designation;
`1000190` identifies fragment K and is explicitly presented as the representative catalog anchor,
not as an identifier for the entire train. Original query form:
`https://ssd-api.jpl.nasa.gov/sbdb.api?spk={SPK_ID}&phys-par=1`. NASA/JPL and the cited mission
teams are credited; factual API data are not redistributed imagery.

| Shipped asset         | Source / mission                                                                                | Credit                                                      | Permanent identity   | License / citation                                                   | SHA-256                                                            | Original URL                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `halley-stooke.obj`   | NASA PDS Stooke V1.0 longitude/latitude/radius model; Giotto and Vega imaging; 5,256 plates     | Philip Stooke, Alain Abergel; Giotto HMC and Vega TVS teams | NAIF / SPK `1000036` | NASA PDS public data; cite DOI `10.26033/yt84-5y91`                  | `49258d6a148a7871f2c21ddf40c37208594ed29a2b3333fd59983aee932a9e19` | https://sbnarchive.psi.edu/pds4/non_mission/small_bodies.stooke.shape-models/data/1682q1halley.tab                          |
| `67p-rosetta.obj`     | ESA PSA / NASA PDS Rosetta 67P V2.0; SPC_ESA MTP019 low-resolution flight model; 104,192 plates | ESA/Rosetta/NAVCAM; ESA Flight Dynamics                     | NAIF / SPK `1000012` | ESA scientific archive; cite `RO-C-MULTI-5-67P-SHAPE-V2.0`           | `4118de78f47412e48bf9acc555d37ccbfb96ea9780c49adcf9ca422f238d2b76` | https://pdssbn.astro.umd.edu/holdings/ro-c-multi-5-67p-shape-v2.0/data/triplate/spc_esa/mtp019/cshp_dv_130_01_lores_obj.obj |
| `tempel1-mission.obj` | NASA PDS Tempel 1 V2.0 VRML model; Deep Impact plus Stardust-NExT imaging; 32,040 plates        | Tony Farnham, Peter Thomas; Deep Impact and Stardust-NExT   | NAIF / SPK `1000093` | NASA PDS public data; cite `DIF-C-HRIV/ITS/MRI-5-TEMPEL1-SHAPE-V2.0` | `20b85539bfcf123a7463d7a8b700acd83b48508047e267c93971ec352e9ef4ab` | https://pdssbn.astro.umd.edu/holdings/dif-c-hriv_its_mri-5-tempel1-shape-v2.0/data/tempel1_2012_cart.wrl                    |
| `wild2-stardust.obj`  | NASA PDS Wild 2 V2.1 Cartesian plate model; only flag-0 mission-derived coverage; 12,364 plates | Tony Farnham, T. Duxbury, R. Kirk and the Stardust team     | NAIF / SPK `1000107` | NASA PDS public data; cite `SDU-C-NAVCAM-5-WILD2-SHAPE-MODEL-V2.1`   | `d470f61543ccd24b6c4a875042cd18f291a0d4fd0a2c7bf6b11c414ac34b6437` | https://pdssbn.astro.umd.edu/holdings/sdu-c-navcam-5-wild2-shape-model-v2.1/data/wild2_cart_full.tab                        |

The Halley radial-grid and Tempel 1 VRML conversions preserve their archived samples and triangle
indices. The Wild 2 conversion intentionally excludes plates flagged as assumed ellipsoid or
nonphysical transitions, leaving the mission-coverage gap open. Halley’s archive describes
roughly 0.5–1 km absolute radial uncertainty. Tempel 1’s archive reports about 60 m uncertainty
where control points constrain the shape, about 100 m at silhouettes, and up to 100–300 m in
unconstrained regions. Borrelly’s official DS1 DEM covers only the illuminated encounter side, so
it is not wrapped around a global mesh; the UI uses measured proportions and states the gap.
Hale–Bopp and Shoemaker–Levy 9 have no resolved global nucleus model. No mission image is treated
as a global texture.

Every coma, dust tail, ion tail, and jet rendered by Exora is generated transient material. Its
strength falls to zero at the authored activity-onset distance; ion tails point anti-solar and
dust tails curve through a qualitative orbital-lag proxy. Localized jets exist only on profiles
with an observation-based mission note, but their live geometry is still labeled simulated.

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

## Live JPL small-body catalog

API contract and deterministic fixtures retrieved **2026-08-24** from the
[NASA/JPL Small-Body Database API](https://ssd-api.jpl.nasa.gov/doc/sbdb.html), version **1.3**.
Credit: NASA/JPL-Caltech Solar System Dynamics and CNEOS. License/use terms: factual NASA/JPL
scientific data; no imagery or shape asset is redistributed by this integration. The browser calls
only Exora's backend. The backend validates the source/version signature, rate-limits callers,
coalesces identical work, caches popular authored objects longer than arbitrary searches, and can
serve an explicitly marked stale record during an upstream outage.

The versioned Eros contract fixture records object identity, orbit classification and solution,
uncertainty-bearing orbital and physical parameters, and Earth close approaches. It is a reduced
deterministic excerpt of the API response: no test calls the live service.

| Dataset                         | Mission / archive                                             | Permanent identifier                                     | Original URL                                                                                      |
| ------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 433 Eros SBDB contract fixture  | JPL SBDB orbit solution 659; NEAR-derived physical parameters | SPK `20000433`                                           | https://ssd-api.jpl.nasa.gov/sbdb.api?spk=20000433&phys-par=1&full-prec=1&ca-data=1&ca-body=Earth |
| Ambiguous-name contract fixture | JPL SBDB designation resolver                                 | Designations `2465`, `1986 P1`, `1986 P1-A`, `1986 P1-B` | https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=Wilson                                                 |
| Not-found contract fixture      | JPL SBDB documented missing-object envelope                   | None                                                     | https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=definitely-not-a-small-body-xyz                        |

Physical values retain JPL's source reference when present. Missing parameters stay missing.
Close-approach displays retain nominal distance, minimum/maximum distance bounds, relative velocity,
and time uncertainty when JPL supplies them. Exora shows at most the six approaches nearest the
retrieval date so a centuries-long solution does not masquerade as a short, curated risk forecast.
The SBDB PHA flag is reproduced as a classification; it is not an impact prediction.
