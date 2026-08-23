# Irregular-body shape model pipeline

Exora renders asteroids, comet nuclei, and irregular moons from published mission meshes. A model
is eligible only when its catalog descriptor records the source, mission, credit, license,
retrieval date, permanent NAIF and SPK identifiers, original URL, checksum, and plate count.
Every shipped model is also listed in `THIRD_PARTY_ASSETS.md`.

## Accepted browser assets

- Official OBJ models may ship directly.
- Official GLB/glTF models may ship directly.
- NAIF Digital Shape Kernels may ship only as a plate-preserving GLB conversion. The original DSK
  URL and SHA-256, conversion date, and exact tool/version must remain in the descriptor's
  `conversion` record.

The renderer rejects a DSK-derived asset without that conversion lineage. It does not smooth,
subdivide, inflate, decimate, or project DSK plates at runtime. Authored lower-detail tiers must be
generated offline and checked against the source model; each LOD records its own triangle count and
checksum.

## DSK conversion

Use the current NAIF Toolkit's `dskexp` utility to export vertices and plates from the `.bds`
kernel, preserving the kernel's body-fixed frame and kilometre units. Convert that plate mesh to
GLB without smoothing, vertex displacement, axis swaps, or generated surface texture. Record both
tool versions in the conversion manifest. Validate the output by comparing:

1. vertex and triangle counts against the `dskexp` export;
2. axis-aligned extents against `dskbrief` and the mission/PDS label;
3. face winding and outward normals;
4. the body-fixed spin axis and prime-meridian convention;
5. a rendered limb against published mission images.

The browser normalizes only display scale. It rescales the three model axes to the descriptor's
measured dimensions, applies the measured pole/rotation metadata, and retains the shape's plates.

## Honest fallback

If no shape LOD fits a device budget—or no official detailed model exists—the renderer uses only
the measured three-axis dimensions to make a neutral triaxial silhouette. It is labeled
“dimensions-only” and never receives craters, boulders, grooves, or other invented geography. If
even dimensions are missing, the descriptor is invalid and the body is not rendered.

## Lighting and performance

A directional solar light, PBR roughness, and per-tier PCF shadow map produce a real night side and
self-shadowing. Mission albedo and normal maps are optional and separately attributed; absent maps
fall back to a neutral low-albedo material. Desktop, mobile, newer Quest, and first-generation
Quest profiles select increasingly smaller authored LOD and shadow budgets. Camera scale is derived
from measured kilometres per scene unit, so a 177 m moonlet and a 573 km protoplanet receive the
same usable framing without pretending they are physically comparable.
