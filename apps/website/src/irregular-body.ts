import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator.js";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { registerBuiltInLoaders } from "@babylonjs/loaders/dynamic.js";
import type { RenderQualityProfile, RenderQualityTier } from "./render-quality.ts";

registerBuiltInLoaders();

export interface ScientificAssetProvenance {
  credit: string;
  license: string;
  mission: string;
  naifId: number;
  originalUrl: string;
  retrievalDate: string;
  source: string;
  spkId: string;
}

export interface DskConversionRecord {
  convertedOn: string;
  sourceDskSha256: string;
  sourceDskUrl: string;
  /** Tool and version used to export the DSK plates without smoothing or remeshing. */
  tool: string;
}

export interface IrregularShapeAsset {
  /** Browser-ready shape format. DSK plates are stored as a lossless GLB conversion. */
  format: "glb" | "obj";
  path: string;
  provenance: ScientificAssetProvenance;
  sha256: string;
  triangleCount: number;
  /** Required when the browser asset was converted from an official NAIF Digital Shape Kernel. */
  conversion?: DskConversionRecord;
}

export interface IrregularShapeModel {
  /** Highest fidelity first is conventional but not required; selection is triangle-budget based. */
  lods: readonly IrregularShapeAsset[];
  sourceKind: "mission-glb" | "mission-obj" | "naif-dsk-conversion";
}

export interface IrregularSurfaceMaterial {
  albedoColor: readonly [number, number, number];
  albedoTexture?: {
    path: string;
    provenance: ScientificAssetProvenance;
  };
  /** Only authoritative mission-derived normal maps belong here. */
  normalMap?: {
    path: string;
    provenance: ScientificAssetProvenance;
  };
  preserveEmbeddedMaterial?: boolean;
  roughness: number;
  treatment: "mission-imagery" | "physically-neutral";
}

export interface IrregularBodyDescriptor {
  /** Full measured axis lengths in the source model's x/y/z directions. */
  dimensionsKilometers: Readonly<{ x: number; y: number; z: number }>;
  name: string;
  naifId: number;
  rotation: {
    /** Obliquity is nullable when the pole solution is not secure. */
    axialTiltDegrees: number | null;
    periodHours: number | null;
    /** Rotation axis in the corrected browser model. */
    spinAxis?: "x" | "y" | "z";
  };
  shapeModel?: IrregularShapeModel;
  spkId: string;
  surface: IrregularSurfaceMaterial;
}

export interface IrregularBodyCameraEnvelope {
  initialRadius: number;
  kilometersPerSceneUnit: number;
  lowerRadiusLimit: number;
  sceneDiameter: number;
  upperRadiusLimit: number;
}

export interface MountedIrregularBody {
  advanceRotation: (elapsedSeconds: number, timeScale?: number) => void;
  camera: IrregularBodyCameraEnvelope;
  dispose: () => void;
  geometryStatus: "dimensions-only" | "measured-shape";
  meshes: readonly AbstractMesh[];
  root: TransformNode;
  selectedAsset: IrregularShapeAsset | null;
  /** Human-readable disclosure suitable for the catalog and body telemetry. */
  surfaceDisclosure: string;
}

const positiveDimensions = (dimensions: IrregularBodyDescriptor["dimensionsKilometers"]): boolean =>
  [dimensions.x, dimensions.y, dimensions.z].every(
    (dimension) => Number.isFinite(dimension) && dimension > 0,
  );

export const validateIrregularBodyDescriptor = (
  descriptor: IrregularBodyDescriptor,
): readonly string[] => {
  const errors: string[] = [];
  if (!positiveDimensions(descriptor.dimensionsKilometers)) {
    errors.push("dimensionsKilometers must contain three finite positive axis lengths");
  }
  if (!Number.isFinite(descriptor.naifId)) errors.push("naifId must be finite");
  if (descriptor.spkId.trim().length === 0) errors.push("spkId is required");
  if (descriptor.surface.treatment === "mission-imagery" && !descriptor.surface.albedoTexture) {
    errors.push("mission-imagery materials require an attributed albedo texture");
  }
  for (const asset of descriptor.shapeModel?.lods ?? []) {
    if (!Number.isInteger(asset.triangleCount) || asset.triangleCount <= 0) {
      errors.push(`${asset.path} must declare a positive integer triangle count`);
    }
    if (descriptor.shapeModel?.sourceKind === "naif-dsk-conversion" && !asset.conversion) {
      errors.push(`${asset.path} must retain its NAIF DSK conversion record`);
    }
    if (asset.provenance.naifId !== descriptor.naifId) {
      errors.push(`${asset.path} NAIF identity does not match ${descriptor.name}`);
    }
    if (asset.provenance.spkId !== descriptor.spkId) {
      errors.push(`${asset.path} SPK identity does not match ${descriptor.name}`);
    }
  }
  return errors;
};

export const selectIrregularShapeAsset = (
  model: IrregularShapeModel | undefined,
  triangleBudget: number,
): IrregularShapeAsset | null => {
  if (!model || triangleBudget <= 0) return null;
  return (
    [...model.lods]
      .filter((asset) => asset.triangleCount <= triangleBudget)
      .sort((left, right) => right.triangleCount - left.triangleCount)[0] ?? null
  );
};

export const irregularBodyCameraEnvelope = (
  dimensionsKilometers: IrregularBodyDescriptor["dimensionsKilometers"],
  sceneDiameter = 6.4,
): IrregularBodyCameraEnvelope => {
  if (!positiveDimensions(dimensionsKilometers) || sceneDiameter <= 0) {
    throw new Error("A camera envelope requires positive measured dimensions and scene scale.");
  }
  const longestAxis = Math.max(
    dimensionsKilometers.x,
    dimensionsKilometers.y,
    dimensionsKilometers.z,
  );
  return {
    initialRadius: sceneDiameter * 1.72,
    kilometersPerSceneUnit: longestAxis / sceneDiameter,
    lowerRadiusLimit: sceneDiameter * 0.62,
    sceneDiameter,
    upperRadiusLimit: sceneDiameter * 7,
  };
};

const tierDisclosure = (tier: RenderQualityTier, selected: IrregularShapeAsset | null): string =>
  selected
    ? `Measured mission shape · ${selected.triangleCount.toLocaleString("en-US")} plates · ${tier} LOD`
    : "Dimensions-only neutral silhouette · detailed shape unavailable at this quality tier";

const createNeutralMaterial = (
  scene: Scene,
  descriptor: IrregularBodyDescriptor,
  profile: RenderQualityProfile,
): PBRMaterial => {
  const material = new PBRMaterial(`${descriptor.name}-measured-surface`, scene);
  const [red, green, blue] = descriptor.surface.albedoColor;
  material.albedoColor = new Color3(red, green, blue);
  material.metallic = 0;
  material.roughness = descriptor.surface.roughness;
  material.environmentIntensity = 0;
  material.directIntensity = 1;
  material.emissiveColor = Color3.Black();

  if (descriptor.surface.albedoTexture) {
    const albedo = new Texture(descriptor.surface.albedoTexture.path, scene, true, false);
    albedo.name = `${descriptor.name}-mission-albedo`;
    albedo.anisotropicFilteringLevel = profile.anisotropicFiltering;
    material.albedoTexture = albedo;
  }
  if (descriptor.surface.normalMap && profile.irregularBodyNormalMapping) {
    const normal = new Texture(descriptor.surface.normalMap.path, scene, true, false);
    normal.name = `${descriptor.name}-authoritative-normal-map`;
    normal.anisotropicFilteringLevel = profile.anisotropicFiltering;
    material.bumpTexture = normal;
  }
  return material;
};

const loadMeasuredShape = async (
  scene: Scene,
  asset: IrregularShapeAsset,
): Promise<readonly AbstractMesh[]> => {
  const imported = await ImportMeshAsync(asset.path, scene, {
    pluginExtension: asset.format === "obj" ? ".obj" : ".glb",
  });
  return imported.meshes;
};

export const createIrregularBody = async (
  scene: Scene,
  descriptor: IrregularBodyDescriptor,
  profile: RenderQualityProfile,
  directionToSun = new Vector3(-0.8, 0.28, -0.45),
): Promise<MountedIrregularBody> => {
  const errors = validateIrregularBodyDescriptor(descriptor);
  if (errors.length > 0) throw new Error(`Invalid irregular body: ${errors.join("; ")}`);

  const camera = irregularBodyCameraEnvelope(descriptor.dimensionsKilometers);
  const selectedAsset = selectIrregularShapeAsset(
    descriptor.shapeModel,
    profile.maxIrregularBodyTriangles,
  );
  const orientationRoot = new TransformNode(`${descriptor.name}-pole-orientation`, scene);
  const spinRoot = new TransformNode(`${descriptor.name}-sidereal-spin`, scene);
  const geometryRoot = new TransformNode(`${descriptor.name}-measured-geometry`, scene);
  spinRoot.parent = orientationRoot;
  geometryRoot.parent = spinRoot;
  orientationRoot.rotation.z =
    descriptor.rotation.axialTiltDegrees === null
      ? 0
      : (descriptor.rotation.axialTiltDegrees * Math.PI) / 180;

  let meshes: readonly AbstractMesh[] = [];
  let geometryStatus: MountedIrregularBody["geometryStatus"] = "dimensions-only";
  if (selectedAsset) {
    try {
      meshes = await loadMeasuredShape(scene, selectedAsset);
      for (const mesh of meshes) if (!mesh.parent) mesh.parent = geometryRoot;
      geometryStatus = "measured-shape";
    } catch {
      meshes = [];
    }
  }

  if (meshes.length === 0) {
    const fallback = MeshBuilder.CreateSphere(
      `${descriptor.name}-dimensions-only-silhouette`,
      { diameter: 1, segments: Math.max(16, Math.round(profile.planetSegments * 0.6)) },
      scene,
    );
    fallback.parent = geometryRoot;
    meshes = [fallback];
    const longestAxis = Math.max(
      descriptor.dimensionsKilometers.x,
      descriptor.dimensionsKilometers.y,
      descriptor.dimensionsKilometers.z,
    );
    const sceneScale = camera.sceneDiameter / longestAxis;
    geometryRoot.scaling.set(
      descriptor.dimensionsKilometers.x * sceneScale,
      descriptor.dimensionsKilometers.y * sceneScale,
      descriptor.dimensionsKilometers.z * sceneScale,
    );
  } else {
    const bounds = geometryRoot.getHierarchyBoundingVectors(true);
    const sourceSize = bounds.max.subtract(bounds.min);
    const longestAxis = Math.max(
      descriptor.dimensionsKilometers.x,
      descriptor.dimensionsKilometers.y,
      descriptor.dimensionsKilometers.z,
    );
    const sceneScale = camera.sceneDiameter / longestAxis;
    geometryRoot.scaling.set(
      (descriptor.dimensionsKilometers.x * sceneScale) / Math.max(sourceSize.x, 1e-6),
      (descriptor.dimensionsKilometers.y * sceneScale) / Math.max(sourceSize.y, 1e-6),
      (descriptor.dimensionsKilometers.z * sceneScale) / Math.max(sourceSize.z, 1e-6),
    );
  }

  const material = createNeutralMaterial(scene, descriptor, profile);
  for (const mesh of meshes) {
    if (!descriptor.surface.preserveEmbeddedMaterial || !mesh.material) mesh.material = material;
    mesh.isPickable = true;
    mesh.receiveShadows = true;
  }

  const normalizedSunDirection = directionToSun.normalizeToNew();
  const light = new DirectionalLight(
    `${descriptor.name}-sunlight`,
    normalizedSunDirection.scale(-1),
    scene,
  );
  light.position = normalizedSunDirection.scale(camera.sceneDiameter * 4);
  light.diffuse = Color3.White();
  light.intensity = 2.1;
  light.autoCalcShadowZBounds = true;
  const shadows = new ShadowGenerator(profile.irregularBodyShadowMapSize, light);
  shadows.usePercentageCloserFiltering = true;
  shadows.bias = 0.0004;
  shadows.normalBias = 0.018;
  for (const mesh of meshes) shadows.addShadowCaster(mesh, true);

  const spinAxis = descriptor.rotation.spinAxis ?? "y";
  const advanceRotation = (elapsedSeconds: number, timeScale = 1): void => {
    const periodHours = descriptor.rotation.periodHours;
    if (periodHours === null || periodHours === 0) return;
    const radians = (elapsedSeconds * timeScale * Math.PI * 2) / (Math.abs(periodHours) * 3_600);
    spinRoot.rotation[spinAxis] += Math.sign(periodHours) * radians;
  };

  return {
    advanceRotation,
    camera,
    dispose: () => {
      shadows.dispose();
      light.dispose();
      material.dispose(true, true);
      orientationRoot.dispose(false, true);
    },
    geometryStatus,
    meshes,
    root: orientationRoot,
    selectedAsset: geometryStatus === "measured-shape" ? selectedAsset : null,
    surfaceDisclosure: tierDisclosure(
      profile.tier,
      geometryStatus === "measured-shape" ? selectedAsset : null,
    ),
  };
};
