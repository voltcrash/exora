"""In Blender's Python Console: import runpy; runpy.run_path('/path/to/art/render-identity.py')"""
from math import radians
from pathlib import Path

import bpy
import struct

PUBLIC = Path(__file__).resolve().parents[1] / "apps/website/public"
scene = bpy.data.scenes.new("Exora • occultation study")
bpy.context.window.scene = scene


def material(name, color, metallic, roughness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return mat, shader


bpy.ops.mesh.primitive_uv_sphere_add(segments=144, ring_count=96)
globe = bpy.context.object
globe.name = "Pelagic marble"
bpy.ops.object.shade_smooth()
ocean, shader = material("Bathyal jade", (.021, .22, .24), .32, .35)
nodes = ocean.node_tree.nodes
link = ocean.node_tree.links.new
noise = nodes.new("ShaderNodeTexNoise")
noise.inputs["Scale"].default_value = 4.7
noise.inputs["Detail"].default_value = 7
noise.inputs["Distortion"].default_value = 2.6
ramp = nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].position = .24
ramp.color_ramp.elements[0].color = (.009, .036, .10, 1)
ramp.color_ramp.elements[1].position = .68
ramp.color_ramp.elements[1].color = (.34, .85, .68, 1)
link(noise.outputs["Fac"], ramp.inputs[0])
link(ramp.outputs[0], shader.inputs["Base Color"])
globe.data.materials.append(ocean)

for radius, width, color in [
    (1.31, .057, (.95, .53, .21)),
    (1.44, .027, (1, .82, .52)),
    (1.52, .012, (.53, .82, .79)),
]:
    bpy.ops.mesh.primitive_torus_add(major_segments=256, minor_segments=12,
        major_radius=radius, minor_radius=width,
        rotation=(radians(13), radians(-26), radians(-8)))
    ring = bpy.context.object
    ring.name = "Dust lane"
    ring.data.materials.append(material("Sunlit dust", color, .32, .29)[0])
    bpy.ops.object.shade_smooth()


def aim(obj):
    obj.rotation_euler = (-obj.location).to_track_quat("-Z", "Y").to_euler()


for position, energy, color, size in [
    ((-3, -4, 4), 520, (1, .9, .72), 3),
    ((2, 2, 2), 900, (.27, .82, 1), 2),
]:
    bpy.ops.object.light_add(type="AREA", location=position)
    light = bpy.context.object
    light.data.energy = energy
    light.data.color = color
    light.data.shape = "DISK"
    light.data.size = size
    aim(light)

bpy.ops.object.camera_add(location=(0, -6, 2.1))
camera = bpy.context.object
aim(camera)
camera.data.type = "ORTHO"
scene.camera = camera
scene.world = bpy.data.worlds.new("Deep space")
scene.world.color = (.008, .013, .022)
scene.render.engine = "CYCLES"
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_percentage = 100
for filename, width, height, framing in [
    ("favicon.png", 32, 32, 3.55),
    ("apple-touch-icon.png", 180, 180, 3.55),
    ("icon-192.png", 192, 192, 3.55),
    ("icon-512.png", 512, 512, 3.55),
    ("icon-maskable-512.png", 512, 512, 4.15),
    ("og-image.jpg", 1200, 630, 5.8),
]:
    scene.render.image_settings.file_format = "JPEG" if filename.endswith("jpg") else "PNG"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    camera.data.ortho_scale = framing
    scene.render.filepath = str(PUBLIC / filename)
    bpy.ops.render.render(write_still=True, scene=scene.name)

icon = PUBLIC / "favicon.png"
data = icon.read_bytes()
header = struct.pack("<HHHBBBBHHII", 0, 1, 1, 32, 32, 0, 0, 1, 32, len(data), 22)
(PUBLIC / "favicon.ico").write_bytes(header + data)
icon.unlink()
