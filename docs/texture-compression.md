# Texture compression

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
