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
transcoded to a 4-bit RGB GPU format uses about one sixth of the previous unmipped RGBA8 allocation;
an 8-bit UASTC target uses about one third. The actual target depends on device capabilities.
This GPU storage reduction, mip filtering, and avoiding browser JPEG decode justify the modest
transfer increases on some routes; KTX2 still requires transcoder work and is not a zero-cost load.

The service worker already treats all `/textures/` and `/ktx2/` requests as cached media, so these
files require no new preload or cache list. Old JPG cache entries expire through the existing
media-cache limit. The initial JavaScript and Lighthouse transfer budgets remain unchanged.

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
