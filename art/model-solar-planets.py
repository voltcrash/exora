"""blender -b -P art/model-solar-planets.py -- /path/to/NASA-glb-cache"""
from math import radians
from pathlib import Path
import sys
from urllib.request import urlretrieve

import bpy
import numpy as np

public = Path(__file__).resolve().parents[1] / "apps/website/public"
models = public / "models/planets"
models.mkdir(parents=True, exist_ok=True)
cache = Path(sys.argv[sys.argv.index("--") + 1])
cache.mkdir(parents=True, exist_ok=True)
base = "https://assets.science.nasa.gov/content/dam/science/psd/"
planets = [
    ("mercury", "Mercury_1_4878", .034),
    ("venus", "Venus_1_12103", 177.36),
    ("earth", "EarthClouds_1_12756", 23.439),
    ("mars", "24881_Mars_1_6792", 25.19),
    ("jupiter", "Jupiter_1_142984", 3.13),
    ("saturn", "Saturn_1_120536", 26.73),
    ("uranus", "Uranus_1_51118", 97.77),
    ("neptune", "Neptune_1_49528", 28.32),
]
tile = 384
portraits = np.zeros((tile, tile * len(planets), 4), dtype=np.float32)


def prepare_material(obj, is_ring):
    material = obj.active_material
    nodes = material.node_tree.nodes
    bsdf = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    image_node = bsdf.inputs["Base Color"].links[0].from_node
    image = image_node.image
    for node in list(nodes):
        if node not in (bsdf, image_node) and node.type != "OUTPUT_MATERIAL":
            nodes.remove(node)
    width, height = image.size
    ratio = min(1, 2048 / max(width, height))
    image.scale(round(width * ratio), round(height * ratio))
    image.file_format = "PNG" if is_ring else "JPEG"
    image.filepath_raw = str(cache / (obj.name + (".png" if is_ring else ".jpg")))
    image.save()
    if image.packed_file:
        image.unpack(method="REMOVE")
    image.reload()
    bsdf.inputs["Roughness"].default_value = 1
    bsdf.inputs["Metallic"].default_value = 0
    bsdf.inputs["Specular IOR Level"].default_value = 0


def rebuild_body(body):
    # Preserve NASA's UV islands as we refine the limb and refit its source ellipsoid.
    axes = body.dimensions / 2
    bpy.context.view_layer.objects.active = body
    mod = body.modifiers.new("Refine limb", "SUBSURF")
    mod.subdivision_type = "SIMPLE"
    mod.levels = 1
    mod.uv_smooth = "NONE"
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for vertex in body.data.vertices:
        vertex.co /= sum((v / a) ** 2 for v, a in zip(vertex.co, axes)) ** .5
    for face in body.data.polygons:
        face.use_smooth = True


for index, (name, asset, tilt) in enumerate(planets):
    source = cache / (name + ".glb")
    if not source.exists():
        folder = "mars/resources/gltf_files/" if name == "mars" else f"solar/2023/09/{name[0]}/"
        urlretrieve(base + folder + asset + ".glb", source)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes = list(bpy.context.selected_objects)
    body = next(obj for obj in meshes if not obj.name.startswith("Rings"))
    for obj in meshes:
        if obj.name.startswith("RingsBottom"):
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        obj.name = "Body" if obj == body else "Rings"
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        obj.scale *= .002  # VTAD source equatorial diameter is 1000 units.
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        if obj == body:
            rebuild_body(body)
        else:
            obj.active_material.use_backface_culling = False
        prepare_material(obj, obj != body)
    # Choose a consistent opening view for the catalog and the interactive globe.
    opening_longitude = {"earth": 135, "jupiter": 70}.get(name, 0)
    if opening_longitude:
        body.rotation_mode = "XYZ"
        body.rotation_euler.z = radians(opening_longitude)
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    bpy.ops.export_scene.gltf(filepath=str(models / (name + ".glb")), export_image_format="AUTO")

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 12
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    scene.render.resolution_x = scene.render.resolution_y = tile
    scene.render.resolution_percentage = 100
    scene.world = bpy.data.worlds.new("Fill")
    scene.world.color = (.12, .12, .12)
    for obj in tuple(scene.objects):
        obj.rotation_mode = "XYZ"
        obj.rotation_euler.y = radians(tilt)
    bpy.ops.object.light_add(type="SUN", location=(-4, -5, 5))
    light = bpy.context.object
    light.rotation_euler = (-light.location).to_track_quat("-Z", "Y").to_euler()
    light.data.energy = 3
    light.data.angle = radians(1)
    bpy.ops.object.camera_add(location=(0, -6, 2.2))
    scene.camera = bpy.context.object
    scene.camera.rotation_euler = (-scene.camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera.data.type = "ORTHO"
    scene.camera.data.ortho_scale = 4.8 if name == "saturn" else 2.45
    scene.render.filepath = str(cache / f"{name}-portrait.png")
    bpy.ops.render.render(write_still=True)
    image = bpy.data.images.load(scene.render.filepath)
    pixels = np.empty(tile * tile * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    portraits[:, index * tile:(index + 1) * tile] = pixels.reshape(tile, tile, 4)

    # The system view draws the whole set at once, often only a few pixels per planet.
    for obj in scene.objects:
        if obj.type != "MESH":
            continue
        obj.rotation_euler = (0, 0, 0)
        material = obj.active_material
        texture = next(node.image for node in material.node_tree.nodes if node.type == "TEX_IMAGE")
        width, height = texture.size
        factor = min(1, 512 / max(width, height))
        texture.scale(max(1, round(width * factor)), max(1, round(height * factor)))
        texture.save()
    bpy.context.view_layer.objects.active = body
    mod = body.modifiers.new("Overview silhouette", "DECIMATE")
    body.data.calc_loop_triangles()
    mod.ratio = min(1, 720 / len(body.data.loop_triangles))
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.export_scene.gltf(filepath=str(models / (name + "-small.glb")), export_image_format="AUTO")

sheet = bpy.data.images.new("Solar planets", tile * len(planets), tile, alpha=True)
sheet.alpha_mode = "STRAIGHT"
sheet.pixels.foreach_set(portraits.ravel())
sheet.file_format = "WEBP"
sheet.filepath_raw = str(public / "textures/solar-planets.webp")
sheet.save()
