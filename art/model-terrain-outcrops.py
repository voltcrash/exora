"""Sculpt and export low-poly outcrops with Blender for surface instancing."""
from math import sin
from pathlib import Path

import bpy
from mathutils import Vector, noise

output = Path(__file__).resolve().parents[1] / "apps/website/public/models/terrain-outcrops.glb"
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()

material = bpy.data.materials.new("Unpainted mineral")
nodes = material.node_tree.nodes
shader = nodes.get("Principled BSDF")
shader.inputs["Roughness"].default_value = 0.91
pigment = nodes.new("ShaderNodeVertexColor")
pigment.layer_name = "Mineral"
material.node_tree.links.new(pigment.outputs["Color"], shader.inputs["Base Color"])


def sculpt(name, axes, seed, subdivision, cuts, layered):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivision)
    rock = bpy.context.object
    rock.name = name
    rock.data.materials.append(material)
    paint = rock.data.color_attributes.new(name="Mineral", type="BYTE_COLOR", domain="POINT")
    offset = Vector((seed * 0.71, -seed * 0.31, seed * 0.37))
    planes = [(Vector(normal).normalized(), height) for normal, height in cuts]
    for index, vertex in enumerate(rock.data.vertices):
        p = vertex.co.normalized()
        broad = noise.fractal(p * 2.3 + offset, 1.0, 2.1, 3)
        fine = noise.noise(p * 12 + offset)
        q = p * (1 + 0.26 * broad + 0.075 * fine)
        for normal, height in planes:
            q -= normal * max(0, q.dot(normal) - height)
        layer = sin((q.z + 0.3 * q.x - 0.12 * q.y + 0.075 * fine) * 37)
        q.z += layered * layer * 0.045
        vertex.co = Vector((q.x * axes[0], q.y * axes[1], (q.z + 0.32) * axes[2]))
        gray = min(1, max(0.25, 0.73 + 0.24 * broad + 0.13 * fine + 0.1 * layered * layer))
        paint.data[index].color = (gray, gray, gray, 1)
    for face in rock.data.polygons:
        face.use_smooth = name == "Boulder"
    rock.data.update()


sculpt("Boulder", (1, 0.74, 0.76), 25, 4,
       [((0.9, 0.3, 0.1), 0.69), ((-0.4, 0.68, 0.64), 0.77)], 0.4)
sculpt("Slab", (1.11, 0.81, 0.41), 57, 3,
       [((0.25, -0.12, 1), 0.56), ((-0.65, 0.45, 0.22), 0.69)], 1)
sculpt("Spire", (0.64, 0.49, 1.44), 128, 3,
       [((1, 0.3, 0.4), 0.45), ((-0.9, 0.1, 0.15), 0.58), ((0.1, -1, 0.25), 0.57)], 0.7)
sculpt("IceShard", (0.48, 0.62, 1.32), 209, 3,
       [((0.88, 0.2, 0.31), 0.38), ((-0.56, 0.82, -0.1), 0.39), ((0.2, -0.87, 0.16), 0.36)], 0.18)

bpy.ops.export_scene.gltf(
    filepath=str(output), export_format="GLB", export_texcoords=False, export_animations=False
)
