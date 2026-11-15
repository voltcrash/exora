# Texture compression

## Solar System mosaics

The 41 colour mosaics, including the eleven 1024×512 mobile variants, are encoded from the
previously shipped JPGs, without resampling or retouching them again. They contain sRGB colour
and complete Lanczos-4 mip chains. Forty maps use ETC1S/BasisLZ at quality 220 and compression
level 5. Ceres uses UASTC quality 3, RDO lambda 0.5, and Zstandard level 18: its small,
high-contrast crater mosaic showed visible block artifacts with ETC1S.

`ceres-topography.jpg` remains unchanged. It supplies red-channel height samples for measured
vertex displacement, rather than display colour. Applying colour compression or sRGB transfer
to it would change the elevations.

Encoding used [Khronos KTX-Software 4.4.2](https://github.com/KhronosGroup/KTX-Software/releases/tag/v4.4.2),
the latest stable release when these maps were converted. The official Linux arm64 archive was
downloaded outside the repository and checked against the release's SHA-256 digest:
`60382e7b842177b8048bd58ccdc770383f8ef65b94452a25d3afdb55f2405c5a`.
Do not commit encoder binaries.

Recover the exact JPEG inputs from the last commit before this conversion, then encode from the
repository root. `KTX_BIN` points to the extracted release's `bin` directory:

```sh
SOURCE_DIR="$(mktemp -d /tmp/exora-solar-source.XXXXXX)"
SOURCE_REV=04388c099ea3c4b5ccb019503f0ccb6993e77da4
git archive "$SOURCE_REV" apps/website/public/textures/solar-system | tar -x -C "$SOURCE_DIR"
KTX_BIN=/tmp/ktx/KTX-Software-4.4.2-Linux-arm64/bin
OUTPUT_DIR=apps/website/public/textures/solar-system

for input in "$SOURCE_DIR"/apps/website/public/textures/solar-system/*.jpg; do
  name="$(basename "$input" .jpg)"
  case "$name" in
    ceres-topography) continue ;;
    ceres)
      "$KTX_BIN/toktx" --encode uastc --uastc_quality 3 --uastc_rdo_l 0.5 --zcmp 18 \
        --threads 4 --genmipmap --filter lanczos4 --assign_oetf srgb \
        "$OUTPUT_DIR/$name.ktx2" "$input"
      ;;
    *)
      "$KTX_BIN/toktx" --encode etc1s --clevel 5 --qlevel 220 \
        --threads 4 --genmipmap --filter lanczos4 --assign_oetf srgb \
        "$OUTPUT_DIR/$name.ktx2" "$input"
      ;;
  esac
  "$KTX_BIN/ktx" validate "$OUTPUT_DIR/$name.ktx2"
done
```

### Choosing the encoding

Earth, Jupiter, Mercury, and Ceres were compared at ETC1S quality 200, 220, and 255, and UASTC
quality 3 with RDO lambda 0.5 and Zstandard level 18. These are complete-file bytes, including
all mips:

| Mosaic  | Original JPG | ETC1S q220 | ETC1S q255 | UASTC RDO |
| ------- | -----------: | ---------: | ---------: | --------: |
| Earth   |      266,599 |    289,058 |    307,607 | 1,206,794 |
| Jupiter |      766,937 |    994,141 |  1,017,987 | 4,185,471 |
| Mercury |    1,598,290 |  1,559,054 |  1,616,021 | 8,094,811 |
| Ceres   |      178,223 |    130,273 |    145,098 |   564,858 |

Decoded level-zero PNGs were inspected at map scale and in detail, alongside production-browser
screenshots. ETC1S q255 made little visible difference to Earth and Jupiter while increasing
transfer. UASTC preserved finer texture detail, but its multi-megabyte cost for the large maps
would consume too much of the 7.5 MB Lighthouse transfer budget. ETC1S q220 keeps the coastlines,
cloud bands, and crater structure at orbital viewing scale; its fine-detail loss is visible at
native texel scale, so it is not a lossless archival replacement. Ceres is the deliberate UASTC
exception: retaining its crater detail costs 386,635 bytes more than the original JPG.

For a repeatable candidate comparison, substitute the input and output names:

```sh
"$KTX_BIN/toktx" --encode etc1s --clevel 5 --qlevel 255 \
  --threads 4 --genmipmap --filter lanczos4 --assign_oetf srgb \
  /tmp/earth-etc1s255.ktx2 "$SOURCE_DIR/apps/website/public/textures/solar-system/earth.jpg"
"$KTX_BIN/toktx" --encode uastc --uastc_quality 3 --uastc_rdo_l 0.5 --zcmp 18 \
  --threads 4 --genmipmap --filter lanczos4 --assign_oetf srgb \
  /tmp/earth-uastc.ktx2 "$SOURCE_DIR/apps/website/public/textures/solar-system/earth.jpg"
"$KTX_BIN/ktx" extract --transcode rgba8 /tmp/earth-etc1s255.ktx2 /tmp/earth-etc1s255.png
"$KTX_BIN/ktx" extract --transcode rgba8 /tmp/earth-uastc.ktx2 /tmp/earth-uastc.png
```

Planet and subsystem views share local transcoder configuration and mobile map selection. The
Babylon KTX2 loader chooses a supported GPU format and falls back to decoded RGBA when compressed
formats are unavailable, as it does for rocky detail maps. Including mips, an opaque ETC1S map
transcoded to a 4-bit RGB GPU format has about one quarter of the previous unmipped RGB8 payload;
an 8-bit UASTC target has about half. The actual target and physical allocation depend on the device.
This GPU storage reduction, mip filtering, and avoiding browser JPEG decode justify the modest
transfer increases on some routes; KTX2 still requires transcoder work and is not a zero-cost load.

The service worker already treats all `/textures/` and `/ktx2/` requests as cached media, so these
files require no new preload or cache list. Old JPG cache entries expire through the existing
media-cache limit. The initial JavaScript and Lighthouse transfer budgets remain unchanged.

### Production-browser measurements

The conversion reduces the 41 colour assets from 22,872,557 to 22,481,465 bytes (1.7%). The eleven
mobile variants fall from 2,264,987 to 1,404,103 bytes (38.0%). These totals include every KTX2 mip
and exclude the unchanged height JPG. Asset totals do not predict a cold route's total transfer:
KTX2 also starts decoder workers, and concurrent workers can fetch separate decoder resources.

Fresh headless Chromium contexts on Linux arm64, with the production build and Vite preview,
measured mobile Jupiter at 1,534,402 response-body bytes before and 2,241,560 after, including
decoder requests from workers. Mobile Earth measured 1,732,960 → 2,233,777 bytes; mobile Moon
1,916,800 → 1,877,204; mobile Mercury 1,657,752 → 2,062,295. The default route measured
755,769 → 755,899 bytes. All remain below 7.5 MB. These are local cold-load samples, not Lighthouse
audit scores; worker scheduling, caching, and deployment compression can change the totals. The
two Vercel-hosted analytics scripts were stubbed identically because localhost does not serve them.

At the time of the mosaic conversion, desktop Earth and Moon exceeded 7.5 MB when their existing rocky detail maps are included.
The subsequent normal-map update below reduces those detail-map transfers. The extra cold-load
bytes on some routes are accepted for GPU storage and worker-based transcoding; the default route
and the 7.5 MB Lighthouse gate are unchanged in scope.

The Chromium upload probe observed Jupiter's complete twelve-level ETC2 RGB chain at 4,321,936
bytes. With all native compressed-texture extensions disabled, Babylon successfully uploaded all
twelve RGBA8 levels (34,559,220 bytes). The ordinary JPG path used an unmipped RGB8 texture,
whose nominal pixel payload is 19,440,000 bytes; the ETC2 chain is about 4.5× smaller despite
including mips. The production captures of Earth, Jupiter, Moon, Mercury, Ceres, and the fallback
configuration had no console errors or failed requests after the identical local analytics stubs.

## Rocky-world detail maps

The five normal maps now store X/Y in R/G with B=0 and A=1, reconstructing positive Z in both
orbital and surface shaders. They are 1024×1024, except cracked at 1024×512 (its source is
rectangular). Roughness and chemistry maps are unchanged. These are tiling artistic materials,
not measured planetary terrain.

The PNG inputs were recovered from git before the original KTX2 conversion (`da9cb8a^`),
not decoded from lossy KTX2 files. Encoding used the latest stable Khronos KTX-Software release,
4.4.2, verified through the GitHub releases API on 2026-11-15. The official Darwin arm64 package
SHA-256 is `500bd8f9d63358c3f3a0d83b724c8574436a72c37dc0e4bad90ec1ca38032c3c`.
The binaries were extracted outside the repository.

```sh
SOURCE_DIR="$(mktemp -d /tmp/exora-normal-source.XXXXXX)"
git archive da9cb8a^ apps/website/public/textures | tar -x -C "$SOURCE_DIR"
KTX_BIN=/path/to/ktx/bin vpx scripts/encode-detail-normals.mjs \
  "$SOURCE_DIR/apps/website/public/textures" apps/website/public/textures
vp run quality:assets
```

The script uses `toktx --encode uastc --uastc_quality 3 --uastc_rdo_l 0.5 --zcmp 18
--threads 4 --genmipmap --filter lanczos4 --assign_oetf linear --normal_mode --normalize
--input_swizzle rg01 --scale 0.5`, then `ktx validate`. `rg01` overrides normal_mode's default
RGB=X/A=Y packing. Normalization and mip generation operate on the source normals before the
encoding swizzle. There are eleven mip levels. Distinct `normal-xy.ktx2` URLs prevent older
RGB shaders from reading the new channel layout during a deployment or service-worker update.

### Channel and format evidence

Babylon 9.33.1's vendored decoder was exercised in the app browser with capability flags for
BC7, ASTC, ETC2, and no compressed formats. For the new basalt map it returned:

| Capability   | Target                   | Full mip payload bytes |
| ------------ | ------------------------ | ---------------------: |
| Desktop BPTC | BC7 RGBA (`0x8e8c`)      |              1,398,128 |
| Mobile ASTC  | ASTC 4×4 RGBA (`0x93b0`) |              1,398,128 |
| ETC2         | ETC2 RGB (`0x9274`)      |                699,064 |
| None         | RGBA8 (`0x8058`)         |              5,592,404 |

All eleven levels decoded successfully. The fallback's first pixel was `[207,132,0,255]`,
confirming R/G survive. Babylon defaults to RGBA8 on BC1/BC3-only hardware to avoid its slow
UASTC conversion. It does **not** select BC5 simply because only two channels contain data.
No global force-RG8 setting is used, since that would break colour textures sharing the loader.
The shader samples `.rg` for every target and clamps the reconstructed square root at zero.
Existing flat-normal fallbacks already have neutral R/G and need no pixel-layout change.
These tests exercise the actual decoder, but supplied capability flags are not physical mobile
GPU measurements. The size reduction mostly comes from halving dimensions, not a promise of
halving GPU block size by dropping Z.

### Transfer and visual measurements

| Family    | Previous bytes |     New bytes |
| --------- | -------------: | ------------: |
| basalt    |      5,320,548 |     1,305,931 |
| cracked   |      2,278,286 |       577,309 |
| granite   |      4,892,217 |     1,216,808 |
| ice       |      5,150,515 |     1,189,910 |
| regolith  |      5,131,019 |     1,270,438 |
| **Total** | **22,772,585** | **5,560,396** |

The complete-file reduction is **75.6%**, including all mips. Palette-dependent per-route normal
transfers are:

| Primary / secondary        | Previous bytes | New bytes |
| -------------------------- | -------------: | --------: |
| basalt / regolith (Moon)   |     10,451,567 | 2,576,369 |
| basalt / cracked           |      7,598,834 | 1,883,240 |
| regolith / granite (Earth) |     10,023,236 | 2,487,246 |
| ice / granite              |     10,042,732 | 2,406,718 |
| basalt / granite           |     10,212,765 | 2,522,739 |
| cracked / regolith         |      7,409,305 | 1,847,747 |

Earth's six requested texture files total **12,075,284 → 4,539,294 bytes** (the after list was
observed in the app browser). Moon uses regolith/basalt, not Earth’s granite/regolith pair:
its six texture files total **12,564,789 → 4,689,591 bytes**, with the after list verified in the
production preview. These are texture-body totals, not compressed whole-route transfer
or Lighthouse scores. Mobile tiers omit PBR detail maps, so their normal-map transfer stays zero.

Before/after captures of Earth in the real WebGL app, at orbit and after zooming down to the
surface, showed no obvious loss of visible terrain relief at those distances. Rotation and water
animation make them qualitative comparisons, not pixel-identical renders. Halving resolution
necessarily discards fine texel detail; no claim is made of losslessness or exhaustive coverage
of every family, viewing distance, or physical GPU. The 7.5 MB Lighthouse budget is unchanged.
