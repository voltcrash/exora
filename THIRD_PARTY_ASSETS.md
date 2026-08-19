# Third-Party Assets

Exora's planets are procedurally generated (geometry, macro terrain, and color are all driven by
`PlanetVisualRecipe`/`WorldRecipe` data — see `packages/worldgen`). The files below are the only
external assets in the repository: a small curated set of CC0 PBR microdetail maps used to give
rocky-planet surfaces close-up material richness (normal/roughness variation) without wrapping
any photographic albedo around a planet. All planet _color_ still comes from the procedural
recipe; these textures only contribute surface normal and roughness detail, blended per-fragment
by a triplanar shader (`apps/website/src/planet-scene.ts`, `ROCKY_FRAGMENT_SHADER`).

All five sets below are CC0 (public domain, no attribution legally required); credits are listed
anyway for provenance.

## Rocky-planet surface detail maps

Stored under `apps/website/public/textures/<family>/`. Each family ships a `normal.png`
(tangent-space normal map) and a `roughness.jpg` (grayscale roughness). A `height.png`
(displacement map) is also downloaded from the same source and kept alongside for future use
(e.g. parallax) but is not currently sampled by the shader.

| Family     | Used for                                                                    | ambientCG asset | Source URL                        | Creator                   | License |
| ---------- | --------------------------------------------------------------------------- | --------------- | --------------------------------- | ------------------------- | ------- |
| `granite`  | Highland/steep-slope rock, granite-family outcrops                          | `Rock058`       | https://ambientcg.com/a/Rock058   | ambientCG (Lennart Demes) | CC0 1.0 |
| `basalt`   | Volcanic rock, lava-adjacent dark rock                                      | `Rock035`       | https://ambientcg.com/a/Rock035   | ambientCG (Lennart Demes) | CC0 1.0 |
| `cracked`  | Crater rims/floors, fractured dry terrain                                   | `Rock063`       | https://ambientcg.com/a/Rock063   | ambientCG (Lennart Demes) | CC0 1.0 |
| `regolith` | Flat/low-slope dust — covers fine regolith, coarse regolith, sand, sediment | `Gravel043`     | https://ambientcg.com/a/Gravel043 | ambientCG (Lennart Demes) | CC0 1.0 |
| `ice`      | Polar caps / ice-cap surface roughness & micro-detail                       | `Snow006`       | https://ambientcg.com/a/Snow006   | ambientCG (Lennart Demes) | CC0 1.0 |

### Original files

Downloaded via ambientCG's public download API:

- `https://ambientcg.com/get?file=<AssetId>_1K-PNG.zip` — source for `normal.png` /
  `height.png` (lossless PNG, so the normal/height data is not degraded by JPEG artifacts before
  we do our own resize).
- `https://ambientcg.com/get?file=<AssetId>_1K-JPG.zip` — source for `roughness.jpg` (roughness
  is a smooth-varying single channel; JPEG here is a fine trade for the smaller download size).

Each zip's `<AssetId>_1K-PNG_NormalGL.png` (OpenGL-convention normal map), `<AssetId>_1K-PNG_Displacement.png`,
and `<AssetId>_1K-JPG_Roughness.jpg` were extracted; the `Color`/`AmbientOcclusion` maps and all
non-image files (`.blend`, `.mtlx`, `.usdc`, `.tres`) were discarded — no color/albedo texture is
shipped, per the "no photographic albedo wrapped around a planet" requirement.

### Transformations applied

All three maps per family were downsampled from the source 1024×1024 to 512×512 with `sips`
(`sips -Z 512`) and re-encoded:

- `normal.png` / `height.png`: kept as lossless PNG at 512×512.
- `roughness.jpg`: re-encoded as JPEG quality 82 at 512×512.

512×512 was chosen because these textures are tiled many times over a planet via triplanar
projection (not mapped 1:1 to the mesh), so the _screen-space_ detail frequency from a 512px tile
sampled at planetary tiling scales (6–13× per world-unit, see `ROCKY_FRAGMENT_SHADER`) is already
well above what's visible at the distances the shader fades detail in at — 1K/2K source
resolution would only add file size, not visible detail, for this use.

Total on-disk footprint for all 15 files: ~3.7 MB.

### KTX2 / Basis Universal — investigated, not yet applied

The brief asked us to investigate KTX2/Basis Universal compression. No KTX2/Basis encoder
(`toktx`, `basisu`) is available in this environment, and CLAUDE.md's toolchain rules restrict
this repo to Vite+ (`vp`)/pnpm-managed dependencies rather than ad hoc native binaries, so
encoding was not performed in this change. The textures currently ship as plain PNG (normal/
height) and JPEG (roughness), which Babylon loads natively with no extra plugin. A follow-up
could add KTX2 delivery via a `vp add`-installed encoder (e.g. wiring `@babylonjs/loaders`' KTX2
support plus a build-time encode step) without changing the shader — it only reads
`Texture`/`RawTexture` objects handed to it by `apps/website/src/texture-cache.ts`.

### Required attribution

None required (CC0 1.0 Universal). Attribution is provided above anyway for provenance
tracking.
