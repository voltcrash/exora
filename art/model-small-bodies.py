"""In a fresh Blender file, run this script with runpy.run_path in the Python Console."""
from math import exp
from pathlib import Path
from random import Random

import bpy
from mathutils import Vector, noise

output = Path(__file__).resolve().parents[1] / "apps/website/public/models"
output.mkdir(parents=True, exist_ok=True)
scene = bpy.data.scenes.new("Exora minor bodies")
bpy.context.window.scene = scene


def sculpt(name, axes, seed, palette, crater_count, neck_depth):
    rng = Random(seed)
    offset = Vector([rng.uniform(-10, 10) for _ in range(3)])
    craters = []
    for _ in range(crater_count):
        axis = Vector([rng.gauss(0, 1) for _ in range(3)]).normalized()
        craters.append((axis, rng.uniform(.05, .26)))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5)
    body = bpy.context.object
    body.name = "Exora " + name
    mesh = body.data
    mesh.name = name + " relief"
    pigment = mesh.color_attributes.new(name="Minerals", type="BYTE_COLOR", domain="POINT")
    for vertex in mesh.vertices:
        p = vertex.co.normalized()
        broad = noise.fractal(p * 1.8 + offset, 1.0, 2.05, 4)
        grain = noise.noise(p * 19 + offset)
        relief = 1 + .22 * broad + .018 * grain - neck_depth * exp(-20 * (p.x + .08) ** 2)
        ejecta = 0
        for axis, width in craters:
            if p.dot(axis) < 1 - 1.3 * width * width:
                continue
            distance = (p - axis).length / width
            relief += width * (.14 * exp(-39 * (distance - .92) ** 2)
                               - .40 * max(0, 1 - distance * distance) ** 2)
            ejecta += .22 * exp(-26 * (distance - 1.06) ** 2)
        vertex.co = Vector([p[i] * axes[i] * relief for i in range(3)])
        shade = max(.4, min(1.65, .82 + .38 * broad + .14 * grain + ejecta))
        pigment.data[vertex.index].color = (*[c * shade for c in palette], 1)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.update()
    material = bpy.data.materials.new(name + " regolith")
    material.use_backface_culling = True
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = .93
    paint = material.node_tree.nodes.new("ShaderNodeVertexColor")
    paint.layer_name = pigment.name
    material.node_tree.links.new(paint.outputs["Color"], shader.inputs["Base Color"])
    mesh.materials.append(material)
    bpy.ops.export_scene.gltf(filepath=str(output / (name + ".glb")), export_format="GLB",
                              use_selection=True, use_active_scene=True, export_texcoords=False, export_animations=False)
    return body


silicate = sculpt("impact-fragment", (1, .76, .67), 841, (.32, .24, .18), 52, 0)
nucleus = sculpt("comet-nucleus", (1.28, .74, .68), 1803, (.12, .105, .09), 19, .43)
ice = sculpt("ice-fragment", (.83, 1.12, .74), 3001, (.39, .52, .59), 29, .04)
for index, body in enumerate([silicate, nucleus, ice]):
    body.location.x = (index - 1) * 3
