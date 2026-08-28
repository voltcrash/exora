import { ActionManager } from "@babylonjs/core/Actions/actionManager.js";
import { ExecuteCodeAction } from "@babylonjs/core/Actions/directActions.js";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ExoplanetProfile } from "@exora/contracts";
import type { MountedWorld, SceneHost } from "./scene-host.ts";
import {
  subsystemOrbitRadius,
  type PlanetarySubsystem,
  type SubsystemMoon,
} from "./planetary-subsystems.ts";
import { createStarfield } from "./star-visuals.ts";

export interface SubsystemWorldOptions {
  onFirstFrame: () => void;
  onSelectMoon?: (name: string) => void;
  planet: ExoplanetProfile;
  subsystem: PlanetarySubsystem;
}

interface OrbitingMoon {
  body: Mesh;
  descriptor: SubsystemMoon;
  orbitalRoot: TransformNode;
}

const PRIMARY_RADIUS = 1.55;

const makeMaterial = (
  name: string,
  scene: Scene,
  color: Color3,
  options: { alpha?: number; emissive?: number; wireframe?: boolean } = {},
): StandardMaterial => {
  const material = new StandardMaterial(`${name}-material`, scene);
  material.diffuseColor = color;
  material.emissiveColor = color.scale(options.emissive ?? 0);
  material.specularColor = color.scale(0.16);
  material.alpha = options.alpha ?? 1;
  material.wireframe = options.wireframe ?? false;
  material.backFaceCulling = options.alpha === undefined;
  return material;
};

const makeOrbit = (
  name: string,
  radius: number,
  color: Color3,
  scene: Scene,
  alpha = 0.2,
): Mesh => {
  const points = Array.from({ length: 129 }, (_value, index) => {
    const angle = (index / 128) * Math.PI * 2;
    return new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  });
  const orbit = MeshBuilder.CreateLines(name, { points }, scene);
  orbit.color = color;
  orbit.alpha = alpha;
  orbit.isPickable = false;
  return orbit;
};

const makeRing = (name: string, innerRadius: number, outerRadius: number, scene: Scene): Mesh => {
  const segments = 160;
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  for (let segment = 0; segment <= segments; segment += 1) {
    const angle = (segment / segments) * Math.PI * 2;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    positions.push(cosine * innerRadius, 0, sine * innerRadius);
    positions.push(cosine * outerRadius, 0, sine * outerRadius);
    uvs.push(segment / segments, 0, segment / segments, 1);
  }
  for (let segment = 0; segment < segments; segment += 1) {
    const offset = segment * 2;
    indices.push(offset, offset + 2, offset + 1, offset + 1, offset + 2, offset + 3);
  }
  const normals = Array.from({ length: positions.length }, (_value, index) =>
    index % 3 === 1 ? 1 : 0,
  );
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.uvs = uvs;
  data.applyToMesh(mesh);
  mesh.isPickable = false;
  return mesh;
};

const moonDisplayRadius = (moon: SubsystemMoon): number =>
  Math.min(
    0.54,
    Math.max(moon.principal ? 0.19 : 0.075, Math.log10(moon.meanRadiusKilometers + 3) * 0.14),
  );

const systemColor = (name: string): Color3 =>
  name === "Jupiter"
    ? new Color3(0.95, 0.48, 0.24)
    : name === "Saturn"
      ? new Color3(0.92, 0.73, 0.42)
      : name === "Uranus"
        ? new Color3(0.35, 0.83, 0.9)
        : name === "Neptune"
          ? new Color3(0.25, 0.51, 0.98)
          : new Color3(0.52, 0.86, 0.92);

export const createSubsystemWorld = (
  host: SceneHost,
  { onFirstFrame, onSelectMoon, planet, subsystem }: SubsystemWorldOptions,
): MountedWorld => {
  const { camera, canvas, engine, profile, scene } = host;
  scene.clearColor = new Color4(0.0005, 0.0012, 0.0035, 1);
  scene.setRenderingAutoClearDepthStencil(1, false, true, true);
  const accent = systemColor(subsystem.parent);
  const meshes: Mesh[] = [];
  const materials: StandardMaterial[] = [];
  const nodes: TransformNode[] = [];
  const equatorialPlane = new TransformNode(`${subsystem.id}-measured-equatorial-plane`, scene);
  equatorialPlane.rotation.z = ((planet.solarSystem?.axialTiltDegrees ?? 0) * Math.PI) / 180;
  nodes.push(equatorialPlane);

  const sunlight = new DirectionalLight(
    "subsystem-sunlight",
    new Vector3(0.86, -0.18, 0.35),
    scene,
  );
  sunlight.diffuse = new Color3(1, 0.84, 0.66);
  sunlight.intensity = 2.35;
  const ambient = new HemisphericLight("subsystem-space-fill", new Vector3(0, 1, 0), scene);
  ambient.diffuse = new Color3(0.16, 0.23, 0.3);
  ambient.groundColor = new Color3(0.015, 0.02, 0.03);
  ambient.intensity = 0.16;

  const primary = MeshBuilder.CreateSphere(
    `${subsystem.id}-primary-measured-globe`,
    { diameter: PRIMARY_RADIUS * 2, segments: profile.systemBodySegments * 3 },
    scene,
  );
  const primaryMaterial = makeMaterial(
    `${subsystem.id}-primary`,
    scene,
    subsystem.parent === "Mars"
      ? new Color3(0.56, 0.21, 0.09)
      : subsystem.parent === "Pluto"
        ? new Color3(0.64, 0.54, 0.46)
        : accent.scale(0.65),
  );
  const primaryTexture = planet.solarSystem?.texture?.path;
  if (primaryTexture) {
    primaryMaterial.diffuseTexture = new Texture(primaryTexture, scene, true, false);
  }
  primary.material = primaryMaterial;
  primary.rotation.z = ((planet.solarSystem?.axialTiltDegrees ?? 0) * Math.PI) / 180;
  meshes.push(primary);
  materials.push(primaryMaterial);

  const starfield = createStarfield({
    count: profile.starCount,
    scene,
    seed: subsystem.parentNaifId * 97,
    viewpoint: null,
  });

  for (const descriptor of subsystem.rings) {
    const inner = subsystemOrbitRadius(subsystem, descriptor.innerRadiusKilometers);
    const outer = subsystemOrbitRadius(subsystem, descriptor.outerRadiusKilometers);
    const ring = makeRing(
      `${subsystem.id}-${descriptor.name.toLocaleLowerCase().replaceAll(" ", "-")}-measured-boundaries`,
      Math.max(PRIMARY_RADIUS * 1.03, inner),
      Math.max(inner + 0.012, outer),
      scene,
    );
    const ringMaterial = makeMaterial(ring.name, scene, Color3.FromArray(descriptor.color), {
      alpha: descriptor.opacity,
      emissive: 0.08,
    });
    ringMaterial.specularColor = new Color3(0.12, 0.12, 0.1);
    ring.material = ringMaterial;
    ring.parent = equatorialPlane;
    ring.renderingGroupId = 1;
    meshes.push(ring);
    materials.push(ringMaterial);
  }

  const orbitingMoons: OrbitingMoon[] = [];
  for (const descriptor of subsystem.moons) {
    const radius = subsystemOrbitRadius(subsystem, descriptor.orbitalSemiMajorAxisKilometers);
    const orbitPlane = new TransformNode(`${descriptor.name}-measured-orbit-plane`, scene);
    orbitPlane.parent = equatorialPlane;
    orbitPlane.rotation.z = (descriptor.inclinationDegrees * Math.PI) / 180;
    const orbit = makeOrbit(
      `${descriptor.name}-mean-orbit-${descriptor.retrograde ? "retrograde" : "prograde"}`,
      radius,
      descriptor.retrograde ? new Color3(0.93, 0.4, 0.5) : accent,
      scene,
      descriptor.principal ? 0.32 : 0.13,
    );
    orbit.parent = orbitPlane;
    meshes.push(orbit);
    nodes.push(orbitPlane);

    const orbitalRoot = new TransformNode(`${descriptor.name}-orbital-motion`, scene);
    orbitalRoot.parent = equatorialPlane;
    orbitalRoot.rotation.z = orbitPlane.rotation.z;
    orbitalRoot.rotation.y = ((descriptor.naifId * 137.508) % 360) * (Math.PI / 180);
    const body =
      descriptor.surface === "mapped"
        ? MeshBuilder.CreateSphere(
            `${descriptor.name}-mapped-mission-mosaic`,
            {
              diameter: moonDisplayRadius(descriptor) * 2,
              segments: profile.systemBodySegments * 2,
            },
            scene,
          )
        : MeshBuilder.CreateIcoSphere(
            `${descriptor.name}-unresolved-neutral-silhouette`,
            { flat: true, radius: moonDisplayRadius(descriptor), subdivisions: 1 },
            scene,
          );
    body.position.x = radius;
    const moonMaterial = makeMaterial(
      `${descriptor.name}-${descriptor.surface}`,
      scene,
      descriptor.surface === "mapped" ? new Color3(0.74, 0.7, 0.64) : new Color3(0.34, 0.38, 0.4),
    );
    if (descriptor.texturePath) {
      moonMaterial.diffuseTexture = new Texture(descriptor.texturePath, scene, true, false);
    }
    body.material = moonMaterial;
    body.parent = orbitalRoot;
    if (onSelectMoon) {
      body.isPickable = true;
      body.actionManager = new ActionManager(scene);
      body.actionManager.registerAction(
        new ExecuteCodeAction(ActionManager.OnPickTrigger, () => onSelectMoon(descriptor.name)),
      );
    }
    meshes.push(body);
    materials.push(moonMaterial);
    nodes.push(orbitalRoot);
    orbitingMoons.push({ body, descriptor, orbitalRoot });
  }

  if (subsystem.magnetosphere) {
    const magnetosphere = MeshBuilder.CreateSphere(
      `${subsystem.id}-${subsystem.magnetosphere.evidence}-magnetosphere`,
      { diameter: 2, segments: 28 },
      scene,
    );
    const dayside = Math.min(
      9.8,
      3.6 + Math.log10(subsystem.magnetosphere.daysideRadiusInPrimaryRadii + 1) * 2.4,
    );
    const tail = Math.min(
      14,
      dayside +
        Math.log10(
          subsystem.magnetosphere.tailRadiusInPrimaryRadii /
            subsystem.magnetosphere.daysideRadiusInPrimaryRadii +
            1,
        ) *
          4,
    );
    magnetosphere.scaling.set(tail, dayside * 0.72, dayside * 0.72);
    magnetosphere.position.x = -(tail - dayside) * 0.52;
    magnetosphere.rotation.z =
      ((planet.solarSystem?.axialTiltDegrees ?? 0) * Math.PI) / 180 +
      (subsystem.magnetosphere.axisTiltDegrees * Math.PI) / 180;
    const magneticMaterial = makeMaterial(
      `${subsystem.id}-magnetosphere`,
      scene,
      new Color3(0.18, 0.66, 0.96),
      { alpha: 0.095, emissive: 0.42, wireframe: true },
    );
    magnetosphere.material = magneticMaterial;
    magnetosphere.isPickable = false;
    magnetosphere.renderingGroupId = 1;
    meshes.push(magnetosphere);
    materials.push(magneticMaterial);
  }

  if (subsystem.aurora) {
    const latitudeRadians = (subsystem.aurora.latitudeDegrees * Math.PI) / 180;
    for (const hemisphere of [-1, 1]) {
      const aurora = MeshBuilder.CreateTorus(
        `${subsystem.id}-${subsystem.aurora.evidence}-auroral-region-${hemisphere > 0 ? "north" : "south"}`,
        {
          diameter: PRIMARY_RADIUS * Math.cos(latitudeRadians) * 2.05,
          thickness: 0.035,
          tessellation: 72,
        },
        scene,
      );
      aurora.position.y = hemisphere * PRIMARY_RADIUS * Math.sin(latitudeRadians);
      const auroraMaterial = makeMaterial(`${aurora.name}-glow`, scene, new Color3(0.2, 1, 0.65), {
        alpha: 0.72,
        emissive: 0.9,
      });
      aurora.material = auroraMaterial;
      aurora.parent = primary;
      aurora.isPickable = false;
      aurora.renderingGroupId = 1;
      meshes.push(aurora);
      materials.push(auroraMaterial);
    }
  }

  if (subsystem.torus) {
    const radius = subsystemOrbitRadius(subsystem, subsystem.torus.radiusKilometers);
    const torus = MeshBuilder.CreateTorus(
      `${subsystem.id}-${subsystem.torus.evidence}-${subsystem.torus.moon.toLocaleLowerCase()}-plasma-torus`,
      { diameter: radius * 2, thickness: 0.48, tessellation: 128 },
      scene,
    );
    const torusMaterial = makeMaterial(torus.name, scene, new Color3(0.9, 0.18, 0.43), {
      alpha: 0.17,
      emissive: 0.8,
    });
    torus.material = torusMaterial;
    torus.parent = equatorialPlane;
    torus.isPickable = false;
    torus.renderingGroupId = 1;
    meshes.push(torus);
    materials.push(torusMaterial);
  }

  for (const descriptor of subsystem.plumes) {
    const owner = orbitingMoons.find((candidate) => candidate.descriptor.name === descriptor.moon);
    if (!owner) continue;
    const height = Math.min(0.95, Math.max(0.25, descriptor.heightKilometers / 450));
    const plume = MeshBuilder.CreateLines(
      `${descriptor.moon}-${descriptor.evidence}-simulated-plume`,
      {
        points: [
          new Vector3(0, moonDisplayRadius(owner.descriptor) * -0.7, 0),
          new Vector3(-0.04, -height * 0.5, 0.02),
          new Vector3(0.09, -height, -0.03),
        ],
      },
      scene,
    );
    plume.color =
      descriptor.evidence === "confirmed" ? new Color3(0.7, 0.9, 1) : new Color3(0.8, 0.63, 1);
    plume.alpha = descriptor.evidence === "confirmed" ? 0.72 : 0.38;
    plume.parent = owner.body;
    plume.isPickable = false;
    meshes.push(plume);
  }

  for (const point of subsystem.lagrangePoints) {
    const radius = subsystemOrbitRadius(subsystem, point.radiusKilometers);
    const marker = MeshBuilder.CreatePolyhedron(
      `${subsystem.id}-${point.label}-${point.reference.replaceAll(" ", "-")}-derived-marker`,
      { size: 0.16, type: 1 },
      scene,
    );
    const angle = (point.angleDegrees * Math.PI) / 180;
    marker.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    const markerMaterial = makeMaterial(marker.name, scene, new Color3(0.4, 0.95, 0.76), {
      emissive: 0.62,
    });
    marker.material = markerMaterial;
    marker.isPickable = false;
    meshes.push(marker);
    materials.push(markerMaterial);
  }

  for (const resonance of subsystem.resonances) {
    for (const name of resonance.bodies) {
      const resonantMoon = subsystem.moons.find((candidate) => candidate.name === name);
      if (!resonantMoon) continue;
      const resonantOrbit = makeOrbit(
        `${subsystem.id}-${resonance.ratio.replaceAll(":", "-")}-resonance-${name}`,
        subsystemOrbitRadius(subsystem, resonantMoon.orbitalSemiMajorAxisKilometers),
        new Color3(0.9, 0.7, 0.23),
        scene,
        0.34,
      );
      resonantOrbit.parent = equatorialPlane;
      meshes.push(resonantOrbit);
    }
  }

  const outerOrbit = Math.max(
    9,
    ...subsystem.moons.map((candidate) =>
      subsystemOrbitRadius(subsystem, candidate.orbitalSemiMajorAxisKilometers),
    ),
    ...subsystem.lagrangePoints.map((point) =>
      subsystemOrbitRadius(subsystem, point.radiusKilometers),
    ),
  );
  camera.setTarget(Vector3.Zero());
  camera.alpha = -Math.PI / 2.3;
  camera.beta = Math.PI / 2.45;
  camera.radius = outerOrbit * 1.72;
  camera.lowerRadiusLimit = 4.2;
  camera.upperRadiusLimit = outerOrbit * 3.3;
  camera.lowerBetaLimit = 0.12;
  camera.upperBetaLimit = Math.PI - 0.12;
  if (!host.isInXr()) camera.attachControl(canvas, true);

  let elapsedSeconds = 0;
  const renderObserver = scene.onBeforeRenderObservable.add(() => {
    const deltaSeconds = Math.min(engine.getDeltaTime() / 1_000, 0.05);
    elapsedSeconds += deltaSeconds;
    primary.rotation.y += deltaSeconds * 0.035;
    for (const candidate of orbitingMoons) {
      const direction = candidate.descriptor.retrograde ? -1 : 1;
      const displaySpeed =
        0.18 / Math.max(0.6, Math.log10(candidate.descriptor.orbitalPeriodDays + 1) + 0.5);
      candidate.orbitalRoot.rotation.y += deltaSeconds * displaySpeed * direction;
      candidate.body.rotation.y += deltaSeconds * 0.15 * direction;
    }
    const viewer = scene.activeCamera?.globalPosition ?? camera.globalPosition;
    starfield.update(elapsedSeconds, viewer);
  });
  const firstFrameObserver = scene.onAfterRenderObservable.addOnce(onFirstFrame);

  const placeXrCamera = (initial: boolean): void => {
    const rig = host.xrCamera();
    if (!rig) return;
    rig.position.set(0, initial ? 0 : rig.realWorldHeight, -outerOrbit * 1.55);
    rig.setTarget(Vector3.Zero());
  };

  return {
    farthestView: () => camera.upperRadiusLimit ?? undefined,
    focusXrRig: placeXrCamera,
    restoreDesktopView: () => camera.attachControl(canvas, true),
    dispose: () => {
      scene.onBeforeRenderObservable.remove(renderObserver);
      scene.onAfterRenderObservable.remove(firstFrameObserver);
      starfield.dispose();
      for (const mesh of meshes) mesh.dispose();
      for (const node of nodes) node.dispose();
      for (const material of materials) material.dispose(true, true);
      sunlight.dispose();
      ambient.dispose();
    },
  };
};
