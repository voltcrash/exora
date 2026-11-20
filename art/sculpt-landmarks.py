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


def basalt_prism(x, y, height):
    width, depth, sides = .9, .85, 6
    verts, faces = [], []
    tilt_x = rng.uniform(-.13, .05)
    tilt_y = -.08
    tip = [rng.uniform(-.12, .13) for _ in range(sides)]
    angle = rng.uniform(-.25, .25)
    outline = [rng.uniform(.75, 1.08) for _ in range(sides)]
    for level, widen in [(-.37, 1.11), (.12, 1), (.73, .90), (1, .93)]:
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
    obj = mesh("Cooling joint", verts, faces)
    bevel = obj.modifiers.new("Chipped edges", "BEVEL")
    bevel.width = min(width, depth) * .085
    bevel.segments = 1
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj


def pressure_plate(index):
    x, y = rng.uniform(-9, 9), rng.uniform(-2.7, 2.7)
    ridge = exp(-((x + 1.7) / 5.3) ** 2)
    span = rng.uniform(1.5, 4.1)
    length = (2.2 + ridge * 3.9) * rng.uniform(.67, 1.12)
    angle = rng.uniform(.38, 1.26) * (-1 if index % 4 == 0 else 1)
    bearing = rng.uniform(-.81, .81) + (pi if index % 3 == 0 else 0)
    thickness = rng.uniform(.32, .89)
    outline = [(-.85, -.22), (-1, .37), (-.81, .88), (-.14, 1.05), (.54, .93),
               (.92, .68), (1, .28), (.62, -.18)]
    verts = []
    rim = [(across * span * rng.uniform(.85, 1.12), up * length * rng.uniform(.82, 1.15))
           for across, up in outline]
    for face in (0, 1):
        for across, up in rim:
            depth = up * cos(angle) - face * thickness * sin(angle)
            h = up * sin(abs(angle)) + face * thickness * cos(angle)
            verts.append((x + across * cos(bearing) - depth * sin(bearing),
                          y + x * .24 + across * sin(bearing) + depth * cos(bearing),
                          h - .32 + rng.uniform(-.12, .12)))
    n = len(rim)
    faces = [tuple(range(n)), tuple(reversed(range(n, n * 2)))]
    faces.extend((i, i + n, (i + 1) % n + n, (i + 1) % n) for i in range(n))
    obj = mesh("Rafted ice sheet", verts, faces)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    bevel = obj.modifiers.new("Fractured lip", "BEVEL")
    bevel.width = thickness * .16
    bevel.segments = 1
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj


plates = [pressure_plate(i) for i in range(24)]
export("pressure-ice", plates)

rng = Random(8307)
columns = []
for row in range(4):
    for col in range(9):
        x = (col + .5 * (row % 2) - 4) * 1.29
        y = (row - 1.5) * 1.15
        height = max(.6, 2 + 3.8 * exp(-((x - .8) / 3.2) ** 2) + .55 * row + rng.uniform(-1, .8))
        columns.append(basalt_prism(x, y, height))
export("basalt-joints", columns)
