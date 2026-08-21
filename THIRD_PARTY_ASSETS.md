# Planet Texture Provenance

Exora's macro terrain, oceans, ice, lava, cloud systems, giant bands, geometry, and base color are
procedurally generated from `WorldRecipe` data. Texture assets add close-range material detail;
they are never presented as observed imagery of a real exoplanet.

## CC0 physical-detail maps

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
OpenGL normal map and lossless roughness map. Source 16-bit normals were converted to 8-bit RGB:
browser GPU texture sampling is normalized 8-bit in this path, so this removes download weight
without reducing the precision the shader consumes. Unused color, AO, displacement, scene, and
material files are not shipped.

`Rock063` is natively 2048×1024; the other four families are 2048×2048. Normal and roughness maps
remain lossless PNGs and use mipmaps plus tier-specific anisotropic filtering.

Creator: ambientCG / Lennart Demes. Attribution is not legally required under CC0, but provenance
is retained here.

## Exora chemistry color-detail maps

The five files under `apps/website/public/textures/chemistry/` were generated specifically for
Exora using OpenAI's built-in image generation tool, then resized to power-of-two 1024×1024 PNGs
for reliable mipmapping and wrapping:

- `carbon.png`
- `ice.png`
- `oxidized.png`
- `silicate.png`
- `sulfuric.png`

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
