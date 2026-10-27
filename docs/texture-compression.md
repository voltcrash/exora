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

Desktop Earth and Moon already exceed 7.5 MB when their existing rocky detail maps are included.
This migration does not resolve that pre-existing route-level transfer issue. The extra cold-load
bytes on some routes are accepted for GPU storage and worker-based transcoding; the default route
and the 7.5 MB Lighthouse gate are unchanged in scope.

The Chromium upload probe observed Jupiter's complete twelve-level ETC2 RGB chain at 4,321,936
bytes. With all native compressed-texture extensions disabled, Babylon successfully uploaded all
twelve RGBA8 levels (34,559,220 bytes). The ordinary JPG path used an unmipped RGB8 texture,
whose nominal pixel payload is 19,440,000 bytes; the ETC2 chain is about 4.5× smaller despite
including mips. The production captures of Earth, Jupiter, Moon, Mercury, Ceres, and the fallback
configuration had no console errors or failed requests after the identical local analytics stubs.

## Rocky-world detail maps

Rocky-world detail textures ship as KTX2 containers so Babylon can transcode them to a GPU-native
compressed format. Normal maps use high-quality UASTC; roughness and chemistry maps use the smaller
ETC1S/BasisLZ representation. Every file contains a complete mip chain.

The committed files were encoded with Khronos KTX-Software 4.4.2. When replacing a source texture,
run the matching command from the repository root (substitute the input and output paths):

```sh
toktx --encode uastc --uastc_quality 3 --uastc_rdo_l 0.5 --zcmp 18 \
  --genmipmap --filter lanczos4 --assign_oetf linear --normal_mode --normalize \
  --input_swizzle rgb1 normal.ktx2 normal.png

toktx --encode etc1s --clevel 5 --qlevel 180 --genmipmap --filter lanczos4 \
  --assign_oetf linear roughness.ktx2 roughness.png

toktx --encode etc1s --clevel 5 --qlevel 180 --genmipmap --filter lanczos4 \
  --assign_oetf srgb chemistry.ktx2 chemistry.png
```

`rgb1` keeps normal data in RGB for the existing shader while `normal_mode` and `normalize` tune the
encoder and mip generation for tangent-space normals. Validate generated assets with `ktx2check`
before committing them.
