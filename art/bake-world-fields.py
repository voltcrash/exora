"""Bake seamless data maps. Run via runpy.run_path in Blender's Python Console."""
from math import cos, pi, sin, tau
from pathlib import Path
from struct import unpack_from
import bpy
import numpy as np
from mathutils import Vector, noise

output = Path(__file__).resolve().parents[1] / "apps/website/public/textures/fields"
output.mkdir(parents=True, exist_ok=True)
width, height = 1024, 512
maps = {name: np.ones((height, width, 4), dtype=np.float32)
        for name in ("lithosphere", "convection", "photosphere")}


def fbm(p, frequency, octaves):
    return noise.fractal(p * frequency, 1.0, 2.07, octaves, noise_basis="PERLIN_NEW")


for y in range(height):
    lat = pi * ((y + .5) / height - .5)
    for x in range(width):
        lon = tau * (x + .5) / width
        p = Vector((cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat)))
        flow = noise.noise_vector(p * 2.3, noise_basis="PERLIN_NEW")
        q = p + .19 * flow
        land = fbm(q, 2.15, 6)
        ridge = (1 - abs(fbm(q, 8.4, 4))) ** 5
        grain = fbm(p, 47, 3)
        maps["lithosphere"][y, x, :3] = (.51 + .36 * land, ridge, .51 + .42 * grain)
        curl = noise.noise_vector(p * 4 + flow * 1.7, noise_basis="PERLIN_NEW")
        filament = fbm(p + curl * .16, 12, 5)
        maps["convection"][y, x, :3] = (
            .5 + .41 * fbm(p + flow * .35, 4, 5),
            .5 + .5 * sin(lat * 79 + curl.x * 2.7 + filament * 2),
            .5 + .42 * filament)
        magnetic = p + Vector((3.27, -5.14, 1.19))
        active = fbm(magnetic, 5, 5)
        plage = max(0, 1 - 4 * abs(fbm(magnetic, 11, 4))) ** 2
        distances, _ = noise.voronoi((magnetic + .07 * flow) * 78)
        cells = min(1, 2.7 * (distances[1] - distances[0]))
        maps["photosphere"][y, x, :3] = (cells, .5 + .42 * active, plage)

for name, pixels in maps.items():
    image = bpy.data.images.new(name, width, height, alpha=False, is_data=True)
    image.colorspace_settings.name = "Non-Color"
    image.pixels.foreach_set(np.clip(pixels, 0, 1).ravel())
    image.file_format = "PNG"
    image.filepath_raw = str(output / (name + ".png"))
    image.save()

    # Blender annotates even Non-Color images with a display profile.
    path = Path(image.filepath_raw)
    png = path.read_bytes()
    chunks = [png[:8]]
    offset = 8
    while offset < len(png):
        size, kind = unpack_from(">I4s", png, offset)
        end = offset + size + 12
        if kind in (b"IHDR", b"IDAT", b"IEND"):
            chunks.append(png[offset:end])
        offset = end
    path.write_bytes(b"".join(chunks))
