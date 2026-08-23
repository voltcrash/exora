import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { MountedWorld, SceneHost, WorldConsole } from "./scene-host.ts";
import {
  sampleRegionParticles,
  type RegionParticle,
  type SolarRegionProfile,
} from "./solar-regions.ts";
import { createStarfield } from "./star-visuals.ts";
import type { XrCell } from "./xr-panel-layout.ts";

interface SolarRegionWorldOptions {
  onFirstFrame: () => void;
  region: SolarRegionProfile;
}

const makePointCloud = (
  name: string,
  particles: readonly RegionParticle[],
  color: Color3,
  pointSize: number,
  scene: Scene,
): { material: StandardMaterial; mesh: Mesh } => {
  const mesh = new Mesh(name, scene);
  const positions = particles.flatMap((particle) => [particle.x, particle.y, particle.z]);
  mesh.setVerticesData(VertexBuffer.PositionKind, positions, false, 3);
  mesh.setIndices(particles.map((_particle, index) => index));
  mesh.isUnIndexed = true;
  mesh.isPickable = false;

  const material = new StandardMaterial(`${name}-material`, scene);
  material.disableLighting = true;
  material.emissiveColor = color;
  material.pointsCloud = true;
  material.pointSize = pointSize;
  material.alpha = 0.78;
  mesh.material = material;
  return { material, mesh };
};

const makeOrbitGuide = (name: string, radius: number, color: Color3, scene: Scene): Mesh => {
  const points = Array.from({ length: 129 }, (_value, index) => {
    const angle = (index / 128) * Math.PI * 2;
    return new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  });
  const line = MeshBuilder.CreateLines(name, { points }, scene);
  line.color = color;
  line.alpha = 0.18;
  line.isPickable = false;
  return line;
};

const makeBoundaryShell = (
  name: string,
  color: Color3,
  radius: number,
  scene: Scene,
  opacity: number,
): { material: StandardMaterial; mesh: Mesh } => {
  const mesh = MeshBuilder.CreateSphere(name, { diameter: radius * 2, segments: 48 }, scene);
  mesh.scaling.set(0.9, 0.76, 1.22);
  mesh.position.z = radius * 0.12;
  mesh.isPickable = false;
  const material = new StandardMaterial(`${name}-material`, scene);
  material.diffuseColor = color.scale(0.2);
  material.emissiveColor = color.scale(0.45);
  material.alpha = opacity;
  material.backFaceCulling = false;
  material.wireframe = true;
  mesh.material = material;
  return { material, mesh };
};

const sampleCountFor = (host: SceneHost, region: SolarRegionProfile): number =>
  region.sampleCount[host.profile.tier];

export const createSolarRegionWorld = (
  host: SceneHost,
  { onFirstFrame, region }: SolarRegionWorldOptions,
): MountedWorld => {
  const { camera, canvas, engine, profile, scene } = host;
  scene.clearColor = new Color4(0.0004, 0.001, 0.003, 1);
  const color = Color3.FromArray(region.color);
  const light = new HemisphericLight(`${region.id}-ambient-light`, new Vector3(0, 1, 0), scene);
  light.intensity = 0.18;

  const sun = MeshBuilder.CreateSphere(
    `${region.id}-sun-anchor`,
    { diameter: region.kind === "oort-shell" ? 0.2 : 0.42, segments: 20 },
    scene,
  );
  const sunMaterial = new StandardMaterial(`${region.id}-sun-anchor-material`, scene);
  sunMaterial.disableLighting = true;
  sunMaterial.emissiveColor = new Color3(1, 0.64, 0.24);
  sun.material = sunMaterial;

  const starfield = createStarfield({
    count: profile.starCount,
    scene,
    seed: region.id.length * 4_099,
    viewpoint: null,
  });
  const sceneMeshes: Mesh[] = [sun];
  const sceneMaterials: StandardMaterial[] = [sunMaterial];

  const particles = sampleRegionParticles(region, sampleCountFor(host, region));
  if (region.kind === "trojan-clouds") {
    const leading = makePointCloud(
      `${region.id}-statistical-leading-cloud`,
      particles.filter((particle) => particle.cloud === "leading"),
      color,
      profile.tier === "desktop" ? 2.1 : 1.6,
      scene,
    );
    const trailing = makePointCloud(
      `${region.id}-statistical-trailing-cloud`,
      particles.filter((particle) => particle.cloud === "trailing"),
      color.scale(0.72).add(new Color3(0.12, 0.04, 0.16)),
      profile.tier === "desktop" ? 2.1 : 1.6,
      scene,
    );
    sceneMeshes.push(leading.mesh, trailing.mesh);
    sceneMaterials.push(leading.material, trailing.material);
    sceneMeshes.push(makeOrbitGuide(`${region.id}-jupiter-orbit-guide`, 8, color, scene));
  } else {
    const cloud = makePointCloud(
      `${region.id}-synthetic-population-sample`,
      particles,
      color,
      profile.tier === "desktop" ? 1.9 : 1.5,
      scene,
    );
    sceneMeshes.push(cloud.mesh);
    sceneMaterials.push(cloud.material);
  }

  if (region.kind === "belt") {
    sceneMeshes.push(
      makeOrbitGuide(`${region.id}-inner-bound`, 4, color, scene),
      makeOrbitGuide(`${region.id}-outer-bound`, 12, color, scene),
    );
  }

  if (region.kind === "heliosphere") {
    const termination = makeBoundaryShell(
      `${region.id}-modeled-termination-shell`,
      new Color3(0.95, 0.35, 0.12),
      7.2,
      scene,
      0.15,
    );
    const heliopause = makeBoundaryShell(
      `${region.id}-modeled-heliopause-shell`,
      color,
      10.4,
      scene,
      0.2,
    );
    sceneMeshes.push(termination.mesh, heliopause.mesh);
    sceneMaterials.push(termination.material, heliopause.material);
  } else if (region.evidence === "measured-boundary") {
    const shell = makeBoundaryShell(
      `${region.id}-interpolated-global-shell`,
      color,
      9.2,
      scene,
      0.26,
    );
    sceneMeshes.push(shell.mesh);
    sceneMaterials.push(shell.material);
  }

  camera.setTarget(Vector3.Zero());
  camera.alpha = -Math.PI / 2.4;
  camera.beta = Math.PI / 2.55;
  camera.radius = 19;
  camera.lowerRadiusLimit = 4.5;
  camera.upperRadiusLimit = 38;
  camera.lowerBetaLimit = 0.12;
  camera.upperBetaLimit = Math.PI - 0.12;
  if (!host.isInXr()) camera.attachControl(canvas, true);

  let elapsed = 0;
  const renderObserver = scene.onBeforeRenderObservable.add(() => {
    elapsed += Math.min(engine.getDeltaTime() / 1_000, 0.05);
    const viewer = scene.activeCamera?.globalPosition ?? camera.globalPosition;
    starfield.update(elapsed, viewer);
  });
  const firstFrameObserver = scene.onAfterRenderObservable.addOnce(onFirstFrame);

  const placeXrCamera = (initial: boolean): void => {
    const rig = host.xrCamera();
    if (!rig) return;
    rig.position.set(0, initial ? 0 : rig.realWorldHeight, -17);
    rig.setTarget(Vector3.Zero());
  };
  const sceneActions = (): XrCell[] => [
    {
      detail: "Frame the complete regional model",
      id: "recentre-region",
      label: "Recentre me",
      onSelect: () => placeXrCamera(false),
    },
  ];
  const consoleContributions: WorldConsole = {
    facts: () => [
      { label: "EVIDENCE", value: region.evidence.replaceAll("-", " ") },
      { label: "INNER", value: `${region.distanceAu.inner.toLocaleString()} AU` },
      { label: "OUTER", value: `${region.distanceAu.outer.toLocaleString()} AU` },
      { label: "ANCHOR", value: `NAIF ${region.anchorNaifId}` },
    ],
    sceneActions,
    source: () => `${region.sources[0]?.datasetId ?? "NASA"} · 2026-08-23`,
    subtitle: () => `${region.evidence.replaceAll("-", " ")} · parent ${region.parent}`,
    summary: () => region.disclosure,
    title: () => region.name,
  };

  return {
    console: consoleContributions,
    farthestView: () => camera.upperRadiusLimit ?? undefined,
    focusXrRig: placeXrCamera,
    restoreDesktopView: () => camera.attachControl(canvas, true),
    dispose: () => {
      scene.onBeforeRenderObservable.remove(renderObserver);
      scene.onAfterRenderObservable.remove(firstFrameObserver);
      starfield.dispose();
      for (const mesh of sceneMeshes) mesh.dispose();
      for (const material of sceneMaterials) material.dispose();
      light.dispose();
    },
  };
};
