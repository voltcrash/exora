"""Run in Blender with -- <folder> holding <asset>-Diffuse.jpg and <asset>-nor_gl.jpg (1k)."""
from pathlib import Path
import sys

import bpy
import numpy as np

source = Path(sys.argv[sys.argv.index("--") + 1])
output = Path(__file__).resolve().parents[1] / "apps/website/public/textures/terrain"
output.mkdir(parents=True, exist_ok=True)


def read_pixels(path):
    image = bpy.data.images.load(str(path))
    image.colorspace_settings.name = "Non-Color"
    pixels = np.empty(len(image.pixels), dtype=np.float32)
    image.pixels.foreach_get(pixels)
    array = pixels.reshape(image.size[1], image.size[0], 4)
    bpy.data.images.remove(image)
    return array


for asset, name in [
    ("rocky_gravel", "scree"), ("rock_face_04", "cliff"),
    ("gravelly_sand", "sand"), ("snow_03", "frost"),
]:
    albedo = read_pixels(source / f"{asset}-Diffuse.jpg")
    normal = read_pixels(source / f"{asset}-nor_gl.jpg")
    luminance = albedo[:, :, :3] @ [0.2126, 0.7152, 0.0722]
    normal[:, :, 2] = np.clip(luminance / (2 * np.median(luminance)), 0, 1)
    image = bpy.data.images.new(name, normal.shape[1], normal.shape[0], alpha=False, is_data=True)
    image.colorspace_settings.name = "Non-Color"
    image.pixels.foreach_set(normal.ravel())
    image.file_format = "WEBP"
    image.filepath_raw = str(output / f"{name}.webp")
    image.save()
    bpy.data.images.remove(image)
