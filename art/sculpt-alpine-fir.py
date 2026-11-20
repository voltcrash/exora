"""Model a wind-grown fir and bake its needle sprays into the embedded glTF atlas."""
from math import cos, pi, sin, tau
from pathlib import Path
from random import Random
from tempfile import TemporaryDirectory

import bpy
import numpy as np


rng = Random(7701)
size = 384
atlas = np.zeros((size, size, 4), dtype=np.float32)
atlas[:, :, :3] = (.17, .25, .135)


def stroke(a, b, radius, pigment):
    x, y = np.array(a) * size
    dx, dy = (np.array(b) - a) * size
    left, right = max(0, int(min(x, x + dx) - radius - 1)), min(size, int(max(x, x + dx) + radius + 2))
    bottom, top = max(0, int(min(y, y + dy) - radius - 1)), min(size, int(max(y, y + dy) + radius + 2))
    if left >= right or bottom >= top:
        return
    yy, xx = np.mgrid[bottom:top, left:right]
    t = np.clip(((xx - x) * dx + (yy - y) * dy) / max(.01, dx * dx + dy * dy), 0, 1)
    coverage = np.clip(radius + .6 - np.hypot(xx - x - t * dx, yy - y - t * dy), 0, 1)
    tile = atlas[bottom:top, left:right]
    tile[:, :, :3] += (np.array(pigment) - tile[:, :, :3]) * coverage[:, :, None]
    tile[:, :, 3] = np.maximum(tile[:, :, 3], coverage)


def shoot(a, b, length, bright):
    stroke(a, b, 1.45, (.161, .205, .098))
    dx, dy = np.array(b) - a
    n = max(.01, np.hypot(dx, dy))
    for t in np.linspace(.04, 1., 18):
        u, v = np.array(a) + t * np.array((dx, dy))
        for side in (-1, 1):
            needle = length * (.28 + .72 * sin(t * pi)) * rng.uniform(.64, 1.18)
            hue = bright * rng.uniform(.58, 1.39) * (.85 + .23 * t)
            tip = (u + needle * (.46 * dx + side * dy) / n, v + needle * (.46 * dy - side * dx) / n)
            stroke((u, v), tip, rng.uniform(.68, 1.35), np.array((.266, .357, .172)) * hue)


stroke((.50, .04), (.51, .96), 2.6, (.256, .174, .092))
for side in (-1, 1):
    for t in np.linspace(.065, .91, 14):
        reach = (.071 + .29 * max(0, sin((t + .1) * pi)) ** .8) * (1.1 - t * .58) * rng.uniform(.78, 1.08)
        start = (.5 + .012 * sin(t * 22), t)
        tip = (start[0] + side * reach, min(.982, t + .11 + .13 * (1 - t)))
        shoot(start, tip, .019 + .016 * (1 - t), .78 + t * .30)
        for f in (.43, .72):
            a = np.array(start) + f * (np.array(tip) - start)
            b = (a[0] + side * (.054 + .05 * (1 - t)), a[1] + .073 * (1 - t * .5))
            shoot(a, b, .018, .92 + .12 * t)
shoot((.5, .84), (.51, .98), .025, 1.16)
atlas[:10, :10] = (.264, .175, .091, 1)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
image = bpy.data.images.new("Fir needle sprays", width=size, height=size, alpha=True)
image.alpha_mode = 'STRAIGHT'
image.pixels.foreach_set(atlas.ravel())
with TemporaryDirectory() as folder:
    image.filepath_raw = str(Path(folder) / "fir-sprays.png")
    image.file_format = 'PNG'
    image.save()
    image.pack()

vertices, uv, faces = [], [], []
def point(x, y, z, tex):
    vertices.append((x, y, z))
    uv.append(tex)
    return len(vertices) - 1


ring = []
for z, radius in [(-.35, .17), (.2, .14), (2., .1), (4.2, .055), (6.18, .012)]:
    cap = [point(.017 * z + radius * cos(tau * i / 7), radius * sin(tau * i / 7), z, (.011, .011)) for i in range(7)]
    if ring:
        faces.extend((ring[i], ring[(i + 1) % 7], cap[(i + 1) % 7], cap[i]) for i in range(7))
    ring = cap

for level in range(18):
    z = .84 + level * .295 + rng.uniform(-.09, .09)
    radius = (1.55 * (1 - level / 18.5) ** .84 + .035) * rng.uniform(.78, 1.12)
    offset = rng.random() * tau
    arms = rng.randint(6, 10)
    for arm in range(arms):
        angle = offset + arm * tau / arms + rng.uniform(-.21, .21)
        length = radius * rng.uniform(.75, 1.15)
        broad = length * rng.uniform(.31, .59)
        sag = rng.uniform(.17, .54)
        roll = rng.uniform(-.54, .54)
        previous = []
        for t in (0, .4, .77, 1):
            row = []
            for across in (-1, 0, 1):
                width = broad * across
                h = z + .12 - length * sag * (.81 * t + .36 * sin(t * pi)) - abs(width) * .46 + width * roll
                row.append(point(.017 * z + length * t * cos(angle) - width * sin(angle),
                                 length * t * sin(angle) + width * cos(angle), h,
                                 ((1 + across) * .5, t)))
            if previous:
                faces.extend((previous[i], row[i], row[i + 1], previous[i + 1]) for i in (0, 1))
            previous = row

data = bpy.data.meshes.new("Fir canopy and trunk")
data.from_pydata(vertices, [], faces)
data.update()
layer = data.uv_layers.new(name="Sprays")
for i, loop in enumerate(data.loops):
    layer.data[i].uv = uv[loop.vertex_index]
obj = bpy.data.objects.new("Alpine fir", data)
bpy.context.collection.objects.link(obj)
mat = bpy.data.materials.new("Fir needles and bark")
mat.use_nodes = True
tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
tex.image = image
bsdf = mat.node_tree.nodes.get("Principled BSDF")
mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
mask = mat.node_tree.nodes.new("ShaderNodeMath")
mask.operation = 'GREATER_THAN'
mask.inputs[1].default_value = .36
mat.node_tree.links.new(tex.outputs["Alpha"], mask.inputs[0])
mat.node_tree.links.new(mask.outputs[0], bsdf.inputs["Alpha"])
bsdf.inputs["Roughness"].default_value = .96
obj.data.materials.append(mat)
bpy.ops.export_scene.gltf(filepath=str(Path(__file__).resolve().parents[1] / "apps/website/public/models/alpine-fir.glb"),
                          export_format="GLB", export_animations=False)
