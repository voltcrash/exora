"""Bake periodic cloud lobes and their two horizontal lighting gradients in Blender."""
from pathlib import Path
import bpy
import numpy as np

size = 512
rng = np.random.default_rng(82153)
v, u = np.mgrid[:size, :size] / size


def billows(count, warp):
    x, y = (u + warp) * count, (v - warp * .67) * count
    ix, iy = np.floor(x).astype(int), np.floor(y).astype(int)
    sites = rng.uniform(.12, .88, (count, count, 2))
    nearest = np.full((size, size), 4.)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            offsets = sites[(iy + dy) % count, (ix + dx) % count]
            dist = (ix + dx + offsets[:, :, 0] - x) ** 2 + (iy + dy + offsets[:, :, 1] - y) ** 2
            nearest = np.minimum(nearest, dist)
    return np.sqrt(np.maximum(0., 1. - np.minimum(1., nearest)))


warp = .043 * np.sin(2 * np.pi * (u + v)) + .019 * np.sin(2 * np.pi * (2 * u - 3 * v))
field = sum(weight * billows(n, warp) for weight, n in [(0.63, 5), (0.24, 11), (0.095, 23), (0.035, 51)])
field = np.clip((field - .59) * 2.8, 0., 1.)
gradient = lambda axis: (np.roll(field, -1, axis) - np.roll(field, 1, axis)) * 6
pixels = np.dstack((field, .5 + gradient(1), .5 + gradient(0), np.ones_like(field)))
image = bpy.data.images.new("Cloud billows", width=size, height=size, alpha=False)
image.colorspace_settings.name = 'Non-Color'
image.pixels.foreach_set(np.clip(pixels, 0, 1).astype(np.float32).ravel())
image.file_format = 'PNG'
image.filepath_raw = str(Path(__file__).resolve().parents[1] / "apps/website/public/textures/fields/billows.png")
image.save()
