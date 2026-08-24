import { GlowLayer } from "@babylonjs/core/Layers/glowLayer.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import {
  blackHoleKindLabel,
  formatBlackHoleMass,
  schwarzschildDiameterKilometers,
  type BlackHoleProfile,
} from "./black-holes.ts";
import type { MountedWorld, SceneHost, WorldConsole } from "./scene-host.ts";
import { createStarfield } from "./star-visuals.ts";
import type { XrCell } from "./xr-panel-layout.ts";

const BLACK_HOLE_POSITION = new Vector3(0, 0.7, 7.5);
const XR_BLACK_HOLE_STAND = new Vector3(0, 0, -10);

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

const hslColor = (hueDegrees: number, saturation: number, lightness: number): Color3 => {
  const hue = (((hueDegrees % 360) + 360) % 360) / 360;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = hue * 6;
  const secondary = chroma * (1 - Math.abs((section % 2) - 1));
  const [red, green, blue] =
    section < 1
      ? [chroma, secondary, 0]
      : section < 2
        ? [secondary, chroma, 0]
        : section < 3
          ? [0, chroma, secondary]
          : section < 4
            ? [0, secondary, chroma]
            : section < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  const match = lightness - chroma / 2;
  return new Color3(red + match, green + match, blue + match);
};

const arcPath = (radius: number, start: number, end: number, segments: number): Vector3[] =>
  Array.from({ length: segments + 1 }, (_, index) => {
    const angle = start + ((end - start) * index) / segments;
    return new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
  });

const scientific = (value: number, digits = 2): string => {
  if (value < 1_000_000) return value.toLocaleString("en-US", { maximumFractionDigits: digits });
  return value.toExponential(digits).replace("e+", " × 10^");
};

const distanceLabel = (blackHole: BlackHoleProfile): string =>
  blackHole.distanceLightYears === null
    ? blackHole.observation.redshift === null
      ? "Not reported"
      : `z ${blackHole.observation.redshift}`
    : `${blackHole.distanceLightYears.toLocaleString("en-US")} ly`;

const blackHoleFacts = (blackHole: BlackHoleProfile) => [
  { label: "Mass", value: formatBlackHoleMass(blackHole.massSolar) },
  { label: "Distance", value: distanceLabel(blackHole) },
  { label: "Host", value: blackHole.host },
  { label: "Constellation", value: blackHole.constellation },
  { label: "Accretion", value: blackHole.observation.accretion },
  {
    label: "Schwarzschild Ø",
    value: `${scientific(schwarzschildDiameterKilometers(blackHole))} km`,
  },
];

export interface BlackHoleWorld extends MountedWorld {}

interface BlackHoleWorldOptions {
  blackHole: BlackHoleProfile;
  onFirstFrame: () => void;
}

/**
 * Builds a disclosed visual model of a black-hole environment.
 *
 * The shadow, orbiting luminous bands, photon-ring reference and optional jets are separate scene
 * layers. Their scale is intentionally readable rather than an angular-size reconstruction; the
 * mass-derived number stays in telemetry, while the scene shows the gravitational signatures an
 * observer would use to recognize this class of object. No telescope pixels are repurposed as a
 * literal nearby view.
 */
export const createBlackHoleWorld = (
  host: SceneHost,
  { blackHole, onFirstFrame }: BlackHoleWorldOptions,
): BlackHoleWorld => {
  const { camera, canvas, engine, profile, scene } = host;
  const activity = blackHole.visual.diskActivity;
  const hue = blackHole.visual.diskHueDegrees;

  scene.clearColor = new Color4(0.000_3, 0.000_2, 0.001_2, 1);
  camera.setTarget(BLACK_HOLE_POSITION.clone());
  camera.lowerRadiusLimit = 11;
  camera.upperRadiusLimit = 30;
  camera.lowerBetaLimit = 0.55;
  camera.upperBetaLimit = Math.PI - 0.55;
  camera.alpha = -Math.PI / 2;
  camera.beta = Math.PI / 2.18;
  camera.radius = 17.5;
  if (!host.isInXr()) camera.attachControl(canvas, true);

  const starfield = createStarfield({
    count: profile.starCount,
    scene,
    seed: blackHole.visual.seed,
  });

  const system = new TransformNode("black-hole-system", scene);
  system.position.copyFrom(BLACK_HOLE_POSITION);
  system.rotation.x = radians(57 + blackHole.visual.diskTiltDegrees * 0.22);
  system.rotation.z = radians(blackHole.visual.diskTiltDegrees);

  const shadow = MeshBuilder.CreateSphere(
    "event-horizon-shadow",
    { diameter: 4.25, segments: profile.tier === "desktop" ? 64 : 32 },
    scene,
  );
  shadow.parent = system;
  const shadowMaterial = new StandardMaterial("event-horizon-material", scene);
  shadowMaterial.disableLighting = true;
  shadowMaterial.diffuseColor = Color3.Black();
  shadowMaterial.emissiveColor = new Color3(0.000_1, 0, 0.000_2);
  shadowMaterial.specularColor = Color3.Black();
  shadow.material = shadowMaterial;
  shadow.isPickable = false;

  const diskMeshes: Mesh[] = [];
  const ringCount = profile.tier === "desktop" ? 18 : 11;
  for (let index = 0; index < ringCount; index += 1) {
    const progress = index / Math.max(1, ringCount - 1);
    const radius = 2.72 + progress * 4.9;
    const thickness = 0.045 + (1 - progress) * 0.075;
    const segments = profile.tier === "desktop" ? 44 : 28;
    const band = MeshBuilder.CreateTube(
      `accretion-band-${index}`,
      {
        path: arcPath(radius, 0, Math.PI * 2, segments),
        radius: thickness,
        tessellation: 8,
      },
      scene,
    );
    band.parent = system;
    band.isPickable = false;
    const material = new StandardMaterial(`accretion-band-material-${index}`, scene);
    material.disableLighting = true;
    const localHue = hue + progress * 16;
    const color = hslColor(localHue, 0.88, 0.54 + (1 - progress) * 0.13);
    material.diffuseColor = Color3.Black();
    material.emissiveColor = color.scale((0.35 + activity * 0.85) * (1 - progress * 0.48));
    material.alpha = Math.min(1, (0.18 + activity * 0.82) * (1 - progress * 0.36));
    material.specularColor = Color3.Black();
    band.material = material;
    diskMeshes.push(band);
  }

  const photonRing = MeshBuilder.CreateTorus(
    "photon-ring-reference",
    {
      diameter: 4.72,
      thickness: profile.tier === "desktop" ? 0.075 : 0.11,
      tessellation: profile.tier === "desktop" ? 96 : 48,
    },
    scene,
  );
  photonRing.parent = system;
  photonRing.rotation.x = Math.PI / 2;
  photonRing.isPickable = false;
  const photonMaterial = new StandardMaterial("photon-ring-material", scene);
  photonMaterial.disableLighting = true;
  photonMaterial.diffuseColor = Color3.Black();
  photonMaterial.emissiveColor = hslColor(hue + 12, 0.94, 0.72).scale(0.5 + activity * 0.7);
  photonMaterial.specularColor = Color3.Black();
  photonMaterial.alpha = 0.34 + activity * 0.58;
  photonRing.material = photonMaterial;

  const glow = new GlowLayer("black-hole-glow", scene, {
    blurKernelSize: profile.tier === "desktop" ? 48 : 24,
    mainTextureFixedSize: profile.tier === "desktop" ? 512 : 256,
  });
  glow.intensity = 0.62 + activity * 0.48;
  for (const mesh of diskMeshes) glow.addIncludedOnlyMesh(mesh);
  glow.addIncludedOnlyMesh(photonRing);

  if (blackHole.visual.jetStrength > 0) {
    for (const direction of [-1, 1] as const) {
      const jet = MeshBuilder.CreateCylinder(
        `relativistic-jet-${direction > 0 ? "north" : "south"}`,
        {
          diameterBottom: 0.7 * blackHole.visual.jetStrength,
          diameterTop: 0.04,
          height: 12,
          tessellation: 16,
        },
        scene,
      );
      jet.parent = system;
      jet.position.z = direction * 7.8;
      jet.rotation.x = direction * (Math.PI / 2);
      jet.isPickable = false;
      const jetMaterial = new StandardMaterial(`relativistic-jet-material-${direction}`, scene);
      jetMaterial.disableLighting = true;
      jetMaterial.diffuseColor = Color3.Black();
      jetMaterial.emissiveColor = hslColor(hue + 175, 0.7, 0.72).scale(0.42);
      jetMaterial.alpha = 0.08 + blackHole.visual.jetStrength * 0.15;
      jetMaterial.specularColor = Color3.Black();
      jet.material = jetMaterial;
      glow.addIncludedOnlyMesh(jet);
    }
  }

  if (blackHole.observation.companion) {
    const companion = MeshBuilder.CreateSphere(
      "binary-companion",
      { diameter: blackHole.name === "Cygnus X-1" ? 1.7 : 1.05, segments: 24 },
      scene,
    );
    companion.position.copyFrom(BLACK_HOLE_POSITION).addInPlace(new Vector3(-7.8, 2.6, 0.4));
    companion.isPickable = false;
    const companionMaterial = new StandardMaterial("binary-companion-material", scene);
    companionMaterial.disableLighting = true;
    companionMaterial.diffuseColor = Color3.Black();
    companionMaterial.emissiveColor =
      blackHole.name === "Cygnus X-1" ? new Color3(0.56, 0.72, 1) : new Color3(1, 0.82, 0.52);
    companionMaterial.specularColor = Color3.Black();
    companion.material = companionMaterial;
    glow.addIncludedOnlyMesh(companion);
  }

  let elapsed = 0;
  const renderObserver = scene.onBeforeRenderObservable.add(() => {
    const delta = Math.min(engine.getDeltaTime() / 1_000, 0.05);
    elapsed += delta;
    system.rotation.z =
      radians(blackHole.visual.diskTiltDegrees) + Math.sin(elapsed * 0.14) * 0.008 * activity;
    diskMeshes.forEach((mesh, index) => {
      mesh.scaling.setAll(1 + Math.sin(elapsed * (0.62 + (index % 5) * 0.04) + index) * 0.006);
    });
    const activeCameraPosition = scene.activeCamera?.globalPosition ?? camera.globalPosition;
    starfield.update(elapsed, activeCameraPosition);
  });
  const firstFrameObserver = scene.onAfterRenderObservable.addOnce(onFirstFrame);

  const placeXrCamera = (initial: boolean): void => {
    const rig = host.xrCamera();
    if (!rig) return;
    const headOffset = initial ? 0 : rig.realWorldHeight;
    rig.position.set(
      XR_BLACK_HOLE_STAND.x,
      XR_BLACK_HOLE_STAND.y + headOffset,
      XR_BLACK_HOLE_STAND.z,
    );
    rig.setTarget(BLACK_HOLE_POSITION);
  };

  const sceneActions = (): XrCell[] => [
    {
      detail: "Face the event-horizon model",
      id: "recentre-black-hole",
      label: "Recentre me",
      onSelect: () => placeXrCamera(false),
    },
  ];

  const consoleContributions: WorldConsole = {
    facts: () => blackHoleFacts(blackHole),
    sceneActions,
    source: () => `${blackHole.source.archive} · ${blackHole.source.retrievedOn}`,
    subtitle: () => `${blackHoleKindLabel(blackHole)} · interpretive horizon view`,
    summary: () => blackHole.observation.summary,
    title: () => blackHole.name,
  };

  return {
    console: consoleContributions,
    focusXrRig: placeXrCamera,
    restoreDesktopView: () => camera.attachControl(canvas, true),
    dispose: () => {
      scene.onBeforeRenderObservable.remove(renderObserver);
      scene.onAfterRenderObservable.remove(firstFrameObserver);
      glow.dispose();
    },
  };
};
