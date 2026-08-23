import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { createIrregularBody } from "./irregular-body.ts";
import type { MountedWorld, SceneHost, WorldConsole } from "./scene-host.ts";
import { cometActivityAtDistance, type CometProfile } from "./solar-comets.ts";
import { createStarfield } from "./star-visuals.ts";
import type { XrCell } from "./xr-panel-layout.ts";

export interface CometWorldOptions {
  comet: CometProfile;
  heliocentricDistanceAu: number;
  onFirstFrame: () => void;
}

const activityMaterial = (
  name: string,
  color: Color3,
  alpha: number,
  scene: SceneHost["scene"],
): StandardMaterial => {
  const material = new StandardMaterial(name, scene);
  material.disableLighting = true;
  material.diffuseColor = Color3.Black();
  material.emissiveColor = color;
  material.alpha = alpha;
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  return material;
};

export const createCometWorld = async (
  host: SceneHost,
  { comet, heliocentricDistanceAu, onFirstFrame }: CometWorldOptions,
): Promise<MountedWorld> => {
  const { camera, canvas, engine, profile, scene } = host;
  scene.clearColor = new Color4(0.0006, 0.0012, 0.0035, 1);
  const directionToSun = new Vector3(-0.86, 0.2, -0.46).normalize();
  const body = await createIrregularBody(scene, comet.descriptor, profile, directionToSun);
  const activity = cometActivityAtDistance(comet, heliocentricDistanceAu);
  const starfield = createStarfield({
    count: profile.starCount,
    scene,
    seed: comet.naifId,
    viewpoint: null,
  });

  const transientMeshes: Mesh[] = [];
  const transientMaterials: StandardMaterial[] = [];
  if (activity > 0) {
    const comaMaterial = activityMaterial(
      `${comet.id}-simulated-coma-material`,
      new Color3(0.72, 0.86, 0.78),
      0.006 + activity * 0.012,
      scene,
    );
    transientMaterials.push(comaMaterial);
    for (let shell = 0; shell < (profile.tier === "desktop" ? 5 : 3); shell += 1) {
      const coma = MeshBuilder.CreateSphere(
        `${comet.id}-simulated-sun-facing-coma-${shell}`,
        { diameter: 6.4 + shell * 1.35, segments: profile.tier === "desktop" ? 32 : 18 },
        scene,
      );
      coma.position.copyFrom(directionToSun.scale(0.25 + shell * 0.12));
      coma.material = comaMaterial;
      coma.visibility = Math.max(0.22, activity - shell * 0.11);
      coma.isPickable = false;
      transientMeshes.push(coma);
    }

    const antiSolar = directionToSun.scale(-1);
    const ionMaterial = activityMaterial(
      `${comet.id}-simulated-ion-tail-material`,
      new Color3(0.32, 0.6, 1),
      0.045 * activity,
      scene,
    );
    const dustMaterial = activityMaterial(
      `${comet.id}-simulated-dust-tail-material`,
      new Color3(0.95, 0.73, 0.46),
      0.035 * activity,
      scene,
    );
    transientMaterials.push(ionMaterial, dustMaterial);
    const ionTail = MeshBuilder.CreateTube(
      `${comet.id}-simulated-ion-tail`,
      {
        cap: Mesh.NO_CAP,
        path: [Vector3.Zero(), antiSolar.scale(7), antiSolar.scale(17)],
        radius: 0.025 + activity * 0.025,
        tessellation: profile.tier === "desktop" ? 12 : 6,
      },
      scene,
    );
    ionTail.material = ionMaterial;
    ionTail.isPickable = false;
    transientMeshes.push(ionTail);

    const curve = comet.activity.dustTailCurvature;
    const dustTail = MeshBuilder.CreateTube(
      `${comet.id}-simulated-curved-dust-tail`,
      {
        cap: Mesh.NO_CAP,
        path: [
          Vector3.Zero(),
          antiSolar.scale(3.2).add(new Vector3(0, curve, 0)),
          antiSolar.scale(7).add(new Vector3(0, curve * 3.5, curve)),
          antiSolar.scale(12).add(new Vector3(0, curve * 7, curve * 2.2)),
        ],
        radius: 0.06 + activity * 0.07,
        tessellation: profile.tier === "desktop" ? 14 : 7,
      },
      scene,
    );
    dustTail.material = dustMaterial;
    dustTail.isPickable = false;
    transientMeshes.push(dustTail);

    const jetMaterial = activityMaterial(
      `${comet.id}-simulated-jet-material`,
      new Color3(0.82, 0.86, 0.78),
      0.06 * activity,
      scene,
    );
    transientMaterials.push(jetMaterial);
    for (const [index, jet] of comet.activity.jets.entries()) {
      const latitude = (jet.latitudeDegrees * Math.PI) / 180;
      const longitude = (jet.longitudeDegrees * Math.PI) / 180;
      const direction = new Vector3(
        Math.cos(latitude) * Math.cos(longitude),
        Math.sin(latitude),
        Math.cos(latitude) * Math.sin(longitude),
      );
      const plume = MeshBuilder.CreateTube(
        `${comet.id}-simulated-observation-based-jet-${index}`,
        {
          cap: Mesh.NO_CAP,
          path: [
            direction.scale(2.6),
            direction.scale(4.1),
            direction.scale(6.2).add(directionToSun.scale(0.5)),
          ],
          radius: 0.045 + activity * 0.05,
          tessellation: 7,
        },
        scene,
      );
      plume.material = jetMaterial;
      plume.isPickable = false;
      transientMeshes.push(plume);
    }
  }

  camera.setTarget(Vector3.Zero());
  camera.lowerRadiusLimit = body.camera.lowerRadiusLimit;
  camera.upperRadiusLimit = Math.max(body.camera.upperRadiusLimit, 32);
  camera.lowerBetaLimit = 0.18;
  camera.upperBetaLimit = Math.PI - 0.18;
  camera.alpha = -Math.PI / 2.5;
  camera.beta = Math.PI / 2.2;
  camera.radius = activity > 0 ? 15.5 : body.camera.initialRadius;
  if (!host.isInXr()) camera.attachControl(canvas, true);

  let elapsed = 0;
  const renderObserver = scene.onBeforeRenderObservable.add(() => {
    const delta = Math.min(engine.getDeltaTime() / 1_000, 0.05);
    elapsed += delta;
    body.advanceRotation(delta, 900);
    const viewer = scene.activeCamera?.globalPosition ?? camera.globalPosition;
    starfield.update(elapsed, viewer);
  });
  const firstFrameObserver = scene.onAfterRenderObservable.addOnce(onFirstFrame);
  const placeXrCamera = (initial: boolean): void => {
    const rig = host.xrCamera();
    if (!rig) return;
    rig.position.set(0, initial ? 0 : rig.realWorldHeight, -10);
    rig.setTarget(Vector3.Zero());
  };
  const sceneActions = (): XrCell[] => [
    {
      detail: "Face the measured nucleus",
      id: "recentre-comet",
      label: "Recentre me",
      onSelect: () => placeXrCamera(false),
    },
  ];
  const consoleContributions: WorldConsole = {
    facts: () => [
      { label: "SPK", value: comet.spkId },
      { label: "NUCLEUS", value: `${comet.diameterKilometers.value} km` },
      { label: "PERIHELION", value: `${comet.orbit.perihelionAu} AU` },
      { label: "ACTIVITY", value: `${Math.round(activity * 100)}% simulated` },
      {
        label: "GEOMETRY",
        value:
          body.geometryStatus === "measured-shape" ? "measured model" : comet.evidence.geometry,
      },
    ],
    sceneActions,
    source: () => `NASA/JPL SBDB 1.3 · ${comet.source.retrievedOn}`,
    subtitle: () => `${comet.orbit.class} · parent ${comet.parent}`,
    summary: () => comet.summary,
    title: () => comet.name,
  };

  return {
    console: consoleContributions,
    farthestView: () => camera.upperRadiusLimit ?? undefined,
    focusXrRig: placeXrCamera,
    restoreDesktopView: () => camera.attachControl(canvas, true),
    dispose: () => {
      scene.onBeforeRenderObservable.remove(renderObserver);
      scene.onAfterRenderObservable.remove(firstFrameObserver);
      for (const mesh of transientMeshes) mesh.dispose();
      for (const material of transientMaterials) material.dispose();
      starfield.dispose();
      body.dispose();
    },
  };
};
