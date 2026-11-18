"""Run with runpy.run_path from Blender's Python Console. U is azimuth, V is disk radius."""
from math import cos, pi, sin, tau
from pathlib import Path
from struct import unpack_from

import bpy
import numpy as np
from mathutils import Vector, noise

width, height = 1024, 256
pixels = np.ones((height, width, 4), dtype=np.float32)
for row in range(height):
    radius = (row + 0.5) / height
    for column in range(width):
        azimuth = tau * (column + 0.5) / width
        phase = azimuth + 1.3 * radius
        p = Vector((cos(phase) * 1.83, sin(phase) * 1.83, radius * 5.8))
        flow = noise.fractal(p, 1.05, 2.17, 4, noise_basis="PERLIN_NEW")
        winding = azimuth + 0.15 * flow - 2.4 * radius
        shear = Vector((cos(winding), sin(winding), radius * 13 + flow * 0.23))
        filaments = noise.fractal(shear * 3.7, 1.1, 2.02, 4, noise_basis="PERLIN_NEW")
        compression = sin(radius * 79 * pi + 2.4 * flow + 3.8 * filaments)
        hot = noise.noise(Vector((p.y * 5 + 4, p.z * 4, p.x * 4 + 1.7)), noise_basis="PERLIN_NEW")
        pixels[row, column, :3] = (0.5 + 0.43 * filaments, 0.5 + 0.5 * compression, 0.5 + 0.46 * hot)

image = bpy.data.images.new("Exora accretion disk transport", width, height, alpha=False, is_data=True)
image.colorspace_settings.name = "Non-Color"
image.pixels.foreach_set(np.clip(pixels, 0, 1).ravel())
path = Path(__file__).resolve().parents[1] / "apps/website/public/textures/fields/accretion.png"
image.file_format = "PNG"
image.filepath_raw = str(path)
image.save()
encoded = path.read_bytes()
chunks = [encoded[:8]]
offset = 8
while offset < len(encoded):
    size, kind = unpack_from(">I4s", encoded, offset)
    end = offset + size + 12
    if kind in (b"IHDR", b"IDAT", b"IEND"):
        chunks.append(encoded[offset:end])
    offset = end
path.write_bytes(b"".join(chunks))
print(f"Exora accretion field saved ({width} x {height}).")
