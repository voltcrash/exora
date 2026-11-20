import type { ExoplanetProfile } from "@exora/contracts";
import type { WorldRecipe } from "@exora/worldgen";
import {
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { findPlanetarySubsystem } from "../planetary-subsystems.ts";

const planets = new Map([
  [199, "mercury"],
  [299, "venus"],
  [399, "earth"],
  [499, "mars"],
  [599, "jupiter"],
  [699, "saturn"],
  [799, "uranus"],
  [899, "neptune"],
]);

export async function loadSolarModels(profiles: readonly ExoplanetProfile[], overview: boolean) {
  const names = new Set<string>();
  for (const { solarSystem } of profiles) {
    if (!solarSystem) continue;
    const name = planets.get(solarSystem.naifId);
    if (name) names.add(name);
    const parent = solarSystem.parent?.toLowerCase();
    if (solarSystem.bodyType === "moon" && parent && [...planets.values()].includes(parent))
      names.add(parent);
  }
  const models = new Map<string, Group>();
  const dispose = () => {
    for (const model of models.values()) {
      model.traverse((mesh) => {
        if (!(mesh instanceof Mesh) || !(mesh.material instanceof MeshStandardMaterial)) return;
        mesh.geometry.dispose();
        const image = mesh.material.map?.image;
        if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) image.close();
        mesh.material.map?.dispose();
        mesh.material.dispose();
      });
    }
  };
  const loader = new GLTFLoader();
  const results = await Promise.allSettled(
    [...names].map(async (name) => {
      const { scene } = await loader.loadAsync(
        `/models/planets/${name}${overview ? "-small" : ""}.glb`,
      );
      scene.name = name;
      models.set(name, scene);
    }),
  );
  const failure = results.find((result) => result.status === "rejected");
  if (failure) {
    dispose();
    throw Error("Could not load a Solar System planet model", { cause: failure.reason });
  }
  return { models, dispose };
}

export function createSolarGlobe(recipe: WorldRecipe, model: Group, drawRings: boolean) {
  const root = new Group();
  root.rotation.z = recipe.axialTilt;
  const sun = new Vector3(-0.72, 0.39, 0.58).normalize();
  const direction = { value: new Vector3() };
  const materials: (ShaderMaterial | MeshBasicMaterial)[] = [];
  const annuli: RingGeometry[] = [];
  let extent = 1;
  let body: Mesh | undefined;
  for (const source of model.children) {
    if (!(source instanceof Mesh) || !(source.material instanceof MeshStandardMaterial)) continue;
    const ring = source.name === "Rings";
    if (ring && !drawRings) continue;
    const material = new ShaderMaterial({
      uniforms: { albedo: { value: source.material.map }, sun: direction },
      vertexShader: `varying vec2 coord;
        varying vec3 n;
        void main() {
          coord = uv;
          n = normalMatrix * normal;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
        }`,
      fragmentShader: `uniform sampler2D albedo;
        uniform vec3 sun;
        varying vec2 coord;
        varying vec3 n;
        void main() {
          vec4 pigment = texture2D(albedo, coord);
          float incidence = dot(normalize(n), sun);
          float light = ${ring ? ".35 + .65 * abs(incidence)" : ".045 + .955 * max(incidence, 0.)"};
          gl_FragColor = vec4(pigment.rgb * light, pigment.a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      ...(ring ? { side: DoubleSide, transparent: true, depthWrite: false } : {}),
    });
    materials.push(material);
    const mesh = new Mesh(source.geometry, material);
    mesh.name = source.name;
    if (!ring) body = mesh;
    mesh.onBeforeRender = (_renderer, _scene, camera) => {
      direction.value.copy(sun).transformDirection(camera.matrixWorldInverse);
    };
    mesh.scale.setScalar(recipe.radiusSceneUnits);
    root.add(mesh);
    source.geometry.computeBoundingSphere();
    extent = Math.max(extent, source.geometry.boundingSphere!.radius);
  }
  // Saturn carries the VTAD ring map. Other giant planets have faint, catalogued annuli.
  const subsystem = drawRings && model.name !== "saturn" && findPlanetarySubsystem(model.name);
  if (subsystem) {
    for (const ring of subsystem.rings) {
      const inner = ring.innerRadiusKilometers / subsystem.parentRadiusKilometers;
      const outer = ring.outerRadiusKilometers / subsystem.parentRadiusKilometers;
      const geometry = new RingGeometry(inner, outer, 128);
      const material = new MeshBasicMaterial({
        color: new Color().setRGB(...ring.color, SRGBColorSpace),
        opacity: ring.opacity * 0.25,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      });
      const mesh = new Mesh(geometry, material);
      mesh.raycast = () => {};
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.setScalar(recipe.radiusSceneUnits);
      root.add(mesh);
      materials.push(material);
      annuli.push(geometry);
    }
  }
  return {
    root,
    extent: extent * recipe.radiusSceneUnits,
    setLightDirection(direction: Vector3) {
      sun.copy(direction);
    },
    update(seconds: number, spin = recipe.rotationSpeed) {
      if (body) body.rotation.y = seconds * Math.abs(spin);
    },
    dispose() {
      root.removeFromParent();
      for (const material of materials) material.dispose();
      for (const geometry of annuli) geometry.dispose();
    },
  };
}
