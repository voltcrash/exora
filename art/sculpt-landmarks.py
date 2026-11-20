"""Build the walk-through sandstone window, pressure ice and exposed basalt in Blender."""
from math import cos, exp, pi, sin, tau
from pathlib import Path
from random import Random

import bpy
from mathutils import Vector, noise

out = Path(__file__).resolve().parents[1] / "apps/website/public/models"
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
rng = Random(4181)


def mesh(name, verts, faces, smooth=False):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    for face in data.polygons:
        face.use_smooth = smooth
    return obj


def export(name, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    bpy.ops.export_scene.gltf(filepath=str(out / f"{name}.glb"), use_selection=True,
                              export_format="GLB", export_animations=False, export_texcoords=False)


def signed_power(x, p):
    return (1 if x >= 0 else -1) * abs(x) ** p


verts, faces = [], []
around, across = 152, 48
for i in range(around):
    a = tau * i / around
    u, v = cos(a), sin(a)
    for j in range(across):
        b = tau * j / across
        t = (1 + signed_power(cos(b), .67)) / 2
        inner_x = 3.8 * u - .58 * v + .42
        inner_z = 3.5 * v + 1.05 - .44 * u
        outer_x = 8.9 * signed_power(u, .82) - .87 * v
        crown = 5.2 + 1.8 * exp(-((u + .64) / .19) ** 2) - .65 * exp(-((u - .1) / .26) ** 2)
        outer_z = 1.9 + crown * signed_power(v, .81) - .68 * u
        x = inner_x + (outer_x - inner_x) * t
        z = inner_z + (outer_z - inner_z) * t
        y = signed_power(sin(b), .67) * (1.24 + 1.47 * abs(u) + .34 * sin(a * 4)) + .076 * x
        p = Vector((x, y, z))
        erosion = noise.fractal(p * .82, 1.04, 2.08, 4)
        bedding = .14 * sin(5.2 * (z + .12 * x) + .9 * erosion) + .18 * erosion
        x += .28 * noise.noise(p * .44) + u * cos(b) * bedding
        y += signed_power(sin(b), .7) * (bedding + .48 * noise.noise(p * .43))
        z += .39 * erosion + .35 * noise.noise(p * .46)
        verts.append((x, y, z))
        p0, p1 = i * across + j, ((i + 1) % around) * across + j
        faces.append((p0, i * across + (j + 1) % across,
                      ((i + 1) % around) * across + (j + 1) % across, p1))
arch = mesh("Wind-cut window", verts, faces, True)
# The sweep follows the tunnel from the outer crown toward the observer.
import bmesh
bm = bmesh.new()
bm.from_mesh(arch.data)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(arch.data)
bm.free()
export("sandstone-window", [arch])


def prism(name, x, y, width, depth, height, sides, ice):
    verts, faces = [], []
    tilt_x = rng.uniform(-.52, .52) if ice else rng.uniform(-.13, .05)
    tilt_y = rng.uniform(-.24, .24) if ice else -.08
    tip = [rng.uniform(-.12, .13) for _ in range(sides)]
    angle = rng.uniform(-.25, .25)
    outline = [rng.uniform(.75, 1.08) for _ in range(sides)]
    for level, widen in [(-.37, 1.11), (.12, 1), (.73, .90), (1, .73 if ice else .93)]:
        for i in range(sides):
            a = tau * i / sides + angle
            h = height * (level + tip[i] * (.94 if level == 1 else .14))
            scale = outline[i] * widen * rng.uniform(.97, 1.03)
            verts.append((x + width * cos(a) * scale + h * tilt_x,
                          y + depth * sin(a) * scale + h * tilt_y, h))
    faces.append(tuple(reversed(range(sides))))
    for ring in range(3):
        for i in range(sides):
            a, b = ring * sides + i, ring * sides + (i + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.append(tuple(range(3 * sides, 4 * sides)))
    obj = mesh(name, verts, faces)
    bevel = obj.modifiers.new("Chipped edges", "BEVEL")
    bevel.width = min(width, depth) * (.15 if ice else .085)
    bevel.segments = 1
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj


plates = []
for i in range(21):
    x = rng.uniform(-8, 8)
    y = rng.uniform(-2.5, 2.5) + x * .19
    height = (1.6 + 5 * exp(-((x + 1.7) / 4.6) ** 2)) * rng.uniform(.64, 1.17)
    plates.append(prism("Thrust plate", x, y, rng.uniform(.58, 1.67), rng.uniform(.47, 1.3),
                        height, rng.randrange(4, 8), True))
export("pressure-ice", plates)

columns = []
for row in range(4):
    for col in range(9):
        x = (col + .5 * (row % 2) - 4) * 1.29
        y = (row - 1.5) * 1.15
        height = max(.6, 2 + 3.8 * exp(-((x - .8) / 3.2) ** 2) + .55 * row + rng.uniform(-1, .8))
        columns.append(prism("Cooling joint", x, y, .9, .85, height, 6, False))
export("basalt-joints", columns)
