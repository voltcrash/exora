"""Bake seamless sand, bedrock and ice relief into the RGB channels with Blender."""
from math import cos, sin, tau
from pathlib import Path
from struct import unpack_from

import bpy
import numpy as np
from mathutils import Vector, noise

SIZE = 512
output = (
    Path(__file__).resolve().parents[1]
    / "apps/website/public/textures/fields/terrain-materials.png"
)


def clamp(value):
    return min(1, max(0, value))


def fractal(point, scale, octaves):
    return noise.fractal(point * scale, 1.0, 2.1, octaves, noise_basis="PERLIN_NEW")


pixels = np.ones((SIZE, SIZE, 4), dtype=np.float32)
for y in range(SIZE):
    v = (y + 0.5) / SIZE
    ring = 2.4 + 0.8 * cos(tau * v)
    for x in range(SIZE):
        u = (x + 0.5) / SIZE
        point = Vector((ring * cos(tau * u), ring * sin(tau * u), 0.8 * sin(tau * v)))
        warp = noise.noise_vector(point * 2.7, noise_basis="PERLIN_NEW")
        fractured = point + warp * 0.13
        grain = fractal(point, 68, 2)

        phase = 28 * v + fractal(point, 1.7, 3) * 2.5 + 0.22 * sin(tau * (4 * u + 5 * v))
        ripple = (0.5 + 0.5 * cos(tau * phase)) ** 2.4
        sand = 0.22 + ripple * (0.29 + 0.21 * fractal(point, 4, 2)) + 0.25 * grain

        distances, _ = noise.voronoi(fractured * 4.2)
        edge = distances[1] - distances[0]
        seam = clamp(edge * 9) ** 0.55
        stone = 0.17 + 0.30 * seam + 0.36 * fractal(fractured, 12, 4) + 0.18 * grain
        ice = 0.36 + 0.21 * clamp(edge * 23) + 0.27 * fractal(fractured, 18, 3) + 0.12 * grain

        pixels[y, x, :3] = (clamp(sand), clamp(stone), clamp(ice))

image = bpy.data.images.new("Terrain materials", SIZE, SIZE, alpha=False, is_data=True)
image.colorspace_settings.name = "Non-Color"
image.pixels.foreach_set(pixels.ravel())
image.file_format = "PNG"
image.filepath_raw = str(output)
image.save()

# Retain raw data channels without a display profile.
png = output.read_bytes()
chunks = [png[:8]]
offset = 8
while offset < len(png):
    size, kind = unpack_from(">I4s", png, offset)
    end = offset + size + 12
    if kind in (b"IHDR", b"IDAT", b"IEND"):
        chunks.append(png[offset:end])
    offset = end
output.write_bytes(b"".join(chunks))
