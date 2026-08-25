import type { MissionTrajectoryResponse } from "@exora/contracts";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { MountedWorld, SceneHost, WorldConsole } from "./scene-host.ts";
import type { SolarMissionProfile } from "./solar-missions.ts";
import { createStarfield } from "./star-visuals.ts";
import type { XrCell } from "./xr-panel-layout.ts";

export interface MissionWorld extends MountedWorld {
  setLayerVisible(visible: boolean): void;
}

interface MissionWorldOptions {
  mission: SolarMissionProfile;
  onFirstFrame: () => void;
  /** Told whenever the layer is switched from inside the headset, so the page agrees with it. */
  onLayerVisibilityChange?: (visible: boolean) => void;
  trajectory: MissionTrajectoryResponse | null;
}

const compressedPosition = ({ x, y, z }: { x: number; y: number; z: number }): Vector3 => {
  const vector = new Vector3(x, z, y);
  const distance = vector.length();
  return distance === 0 ? vector : vector.normalize().scale(Math.log1p(distance) * 3.35);
};

const julianDate = (date: string): number =>
  Date.parse(`${date}T00:00:00Z`) / 86_400_000 + 2_440_587.5;

const surfacePosition = (latitude: number, longitude: number, radius: number): Vector3 => {
  const phi = (latitude * Math.PI) / 180;
  const theta = (longitude * Math.PI) / 180;
  return new Vector3(
    radius * Math.cos(phi) * Math.sin(theta),
    radius * Math.sin(phi),
    radius * Math.cos(phi) * Math.cos(theta),
  );
};

export const createMissionWorld = (
  host: SceneHost,
  { mission, onFirstFrame, onLayerVisibilityChange, trajectory }: MissionWorldOptions,
): MissionWorld => {
  const { camera, canvas, engine, profile, scene } = host;
  scene.clearColor = new Color4(0.0004, 0.001, 0.003, 1);
  const light = new HemisphericLight(`${mission.id}-ambient`, new Vector3(0, 1, -0.5), scene);
  light.intensity = mission.kind === "surface-sites" ? 1.1 : 0.16;
  const starfield = createStarfield({
    count: profile.starCount,
    scene,
    seed: mission.id.length * 8_191,
    viewpoint: null,
  });
  const meshes: Mesh[] = [];
  const materials: StandardMaterial[] = [];
  const layerMeshes: Mesh[] = [];

  if (mission.kind === "trajectory") {
    const sun = MeshBuilder.CreateSphere(`${mission.id}-sun-anchor`, { diameter: 0.52 }, scene);
    const sunMaterial = new StandardMaterial(`${mission.id}-sun-material`, scene);
    sunMaterial.disableLighting = true;
    sunMaterial.emissiveColor = new Color3(1, 0.58, 0.18);
    sun.material = sunMaterial;
    meshes.push(sun);
    materials.push(sunMaterial);

    if (trajectory) {
      const path = MeshBuilder.CreateLines(
        `${mission.id}-measured-horizons-trajectory`,
        { points: trajectory.data.map(({ positionAu }) => compressedPosition(positionAu)) },
        scene,
      );
      path.color = new Color3(0.2, 0.86, 1);
      path.alpha = 0.76;
      path.isPickable = false;
      meshes.push(path);
      layerMeshes.push(path);

      for (const milestone of mission.milestones) {
        const jd = julianDate(milestone.date);
        const closest = trajectory.data.reduce((best, point) =>
          Math.abs(point.julianDateTdb - jd) < Math.abs(best.julianDateTdb - jd) ? point : best,
        );
        const marker = MeshBuilder.CreateSphere(
          `${mission.id}-${milestone.label.toLocaleLowerCase().replaceAll(" ", "-")}-sample`,
          { diameter: 0.16, segments: 12 },
          scene,
        );
        marker.position.copyFrom(compressedPosition(closest.positionAu));
        marker.isPickable = false;
        const material = new StandardMaterial(`${marker.name}-material`, scene);
        material.disableLighting = true;
        material.emissiveColor = new Color3(1, 0.79, 0.34);
        marker.material = material;
        meshes.push(marker);
        materials.push(material);
        layerMeshes.push(marker);
      }
    }
    camera.radius = 18;
    camera.lowerRadiusLimit = 3;
    camera.upperRadiusLimit = 40;
  } else {
    const body = MeshBuilder.CreateSphere(
      `${mission.id}-${mission.parent.toLocaleLowerCase()}-context`,
      { diameter: 10, segments: 64 },
      scene,
    );
    const bodyMaterial = new StandardMaterial(`${mission.id}-body-material`, scene);
    bodyMaterial.diffuseColor =
      mission.parent === "Mars" ? new Color3(0.48, 0.18, 0.08) : new Color3(0.38, 0.4, 0.43);
    bodyMaterial.specularColor = new Color3(0.03, 0.03, 0.03);
    body.material = bodyMaterial;
    meshes.push(body);
    materials.push(bodyMaterial);
    for (const site of mission.sites) {
      const marker = MeshBuilder.CreateSphere(
        `${mission.id}-${site.label.toLocaleLowerCase().replaceAll(" ", "-")}-site`,
        { diameter: 0.18, segments: 12 },
        scene,
      );
      marker.position.copyFrom(
        surfacePosition(site.latitudeDegrees, site.longitudeDegreesEast, 5.08),
      );
      marker.isPickable = false;
      const material = new StandardMaterial(`${marker.name}-material`, scene);
      material.disableLighting = true;
      material.emissiveColor = new Color3(0.15, 0.9, 1);
      marker.material = material;
      meshes.push(marker);
      materials.push(material);
      layerMeshes.push(marker);
    }
    camera.radius = 15;
    camera.lowerRadiusLimit = 7;
    camera.upperRadiusLimit = 28;
  }

  for (const mesh of layerMeshes) mesh.setEnabled(false);
  camera.setTarget(Vector3.Zero());
  camera.alpha = -Math.PI / 2.35;
  camera.beta = Math.PI / 2.45;
  camera.lowerBetaLimit = 0.12;
  camera.upperBetaLimit = Math.PI - 0.12;
  if (!host.isInXr()) camera.attachControl(canvas, true);

  let elapsed = 0;
  const renderObserver = scene.onBeforeRenderObservable.add(() => {
    elapsed += Math.min(engine.getDeltaTime() / 1_000, 0.05);
    starfield.update(elapsed, scene.activeCamera?.globalPosition ?? camera.globalPosition);
  });
  const firstFrameObserver = scene.onAfterRenderObservable.addOnce(onFirstFrame);
  const placeXrCamera = (initial: boolean): void => {
    const rig = host.xrCamera();
    if (!rig) return;
    rig.position.set(
      0,
      initial ? 0 : rig.realWorldHeight,
      mission.kind === "surface-sites" ? -14 : -18,
    );
    rig.setTarget(Vector3.Zero());
  };
  /**
   * Whether the drawn trajectory is on.
   *
   * It starts off, because the mission layer is an addition to the natural Solar System rather
   * than part of it. That default used to make a mission the one destination an immersive session
   * could open on nothing at all: the switch lived on the page, which a wearer cannot reach, so
   * the headset showed a star field, a distant Sun, and no way to ask for the thing being visited.
   */
  let layerVisible = false;
  const showLayer = (visible: boolean): void => {
    layerVisible = visible;
    for (const mesh of layerMeshes) mesh.setEnabled(visible);
    host.refreshConsole();
  };

  const sceneActions = (): XrCell[] => [
    {
      badge: layerVisible ? "ON" : "OFF",
      detail:
        mission.kind === "trajectory"
          ? "The flown path, drawn over the natural system"
          : "The measured landing sites, drawn on the surface",
      id: "mission-layer",
      label: layerVisible ? "Hide the mission layer" : "Show the mission layer",
      onSelect: () => {
        showLayer(!layerVisible);
        onLayerVisibilityChange?.(layerVisible);
      },
    },
    {
      detail: "Frame the mission context",
      id: "recentre-mission",
      label: "Recentre me",
      onSelect: () => placeXrCamera(false),
    },
  ];
  const consoleContributions: WorldConsole = {
    facts: () => [
      { label: "LAYER", value: layerVisible ? "VISIBLE" : "HIDDEN" },
      {
        label: "EVIDENCE",
        value: mission.kind === "trajectory" ? "HORIZONS / SPICE" : "MEASURED SITES",
      },
      {
        label: "ID",
        value:
          mission.kind === "trajectory" ? `SPK ${mission.spkId}` : `NAIF ${mission.anchorNaifId}`,
      },
      { label: "PARENT", value: mission.parent },
    ],
    sceneActions,
    source: () => `${mission.sources[0]?.datasetId ?? "NASA"} · 2026-08-24`,
    subtitle: () => `optional mission layer · parent ${mission.parent}`,
    summary: () => mission.summary,
    title: () => mission.name,
  };

  return {
    console: consoleContributions,
    farthestView: () => camera.upperRadiusLimit ?? undefined,
    focusXrRig: placeXrCamera,
    restoreDesktopView: () => camera.attachControl(canvas, true),
    setLayerVisible: showLayer,
    dispose: () => {
      scene.onBeforeRenderObservable.remove(renderObserver);
      scene.onAfterRenderObservable.remove(firstFrameObserver);
      starfield.dispose();
      for (const mesh of meshes) mesh.dispose();
      for (const material of materials) material.dispose();
      light.dispose();
    },
  };
};
