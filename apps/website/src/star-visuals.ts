import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { loadSkyCatalog, projectSky, type SkyViewpoint } from "./sky-catalog.ts";
import { markAsVirtualBackground } from "./virtual-background.ts";

const STAR_PSF_GLSL = `
float starPointSpread(vec2 corner, float spikeStrength, float spikeSharpness) {
  float radius = length(corner);

  float core = exp(-radius * radius * 34.0);
  float halo = exp(-radius * 4.6) * 0.34;
  float veil = exp(-radius * 1.55) * 0.085;

  float spikes = 0.0;
  if (spikeStrength > 0.0) {
    vec2 axis = abs(corner);
    float spikeHorizontal = exp(-axis.y * axis.y * spikeSharpness) * exp(-axis.x * 3.1);
    float spikeVertical = exp(-axis.x * axis.x * spikeSharpness) * exp(-axis.y * 3.1);
    vec2 diagonal = abs(vec2(corner.x + corner.y, corner.x - corner.y) * 0.70710678);
    float spikeDiagonalA = exp(-diagonal.y * diagonal.y * spikeSharpness * 2.0)
      * exp(-diagonal.x * 4.8);
    float spikeDiagonalB = exp(-diagonal.x * diagonal.x * spikeSharpness * 2.0)
      * exp(-diagonal.y * 4.8);
    spikes = (spikeHorizontal + spikeVertical) * 0.5 + (spikeDiagonalA + spikeDiagonalB) * 0.2;
  }

  return (core + halo + veil + spikes * spikeStrength) * (1.0 - smoothstep(0.6, 1.0, radius));
}

vec3 starClipToWhite(vec3 tint, float intensity) {
  return mix(tint, vec3(1.0), clamp(intensity - 0.5, 0.0, 1.0) * 0.92);
}
`;

const GLARE_VERTEX_SHADER = `
precision highp float;
attribute vec3 position;
attribute vec2 corner;

uniform mat4 worldView;
uniform mat4 projection;
uniform float glareRadius;
uniform float glareScale;
uniform float depthOffset;

varying vec2 vCorner;

void main(void) {
  vec4 viewPosition = worldView * vec4(position, 1.0);
  float originalDepth = viewPosition.z;
  float shiftedDepth = max(originalDepth - depthOffset * glareScale, originalDepth * 0.05);
  float projectionScale = shiftedDepth / max(originalDepth, 0.0001);
  viewPosition.xy = (viewPosition.xy + corner * glareRadius * glareScale) * projectionScale;
  viewPosition.z = shiftedDepth;
  vCorner = corner;
  gl_Position = projection * viewPosition;
}`;

const GLARE_FRAGMENT_SHADER = `
precision highp float;
varying vec2 vCorner;

uniform float time;
uniform float glareIntensity;
uniform float spikeStrength;
uniform float discFraction;
uniform vec3 glareColor;

${STAR_PSF_GLSL}

void main(void) {
  float spread = starPointSpread(vCorner, spikeStrength, 700.0);

  float radius = length(vCorner);
  float outsideDisc = smoothstep(discFraction * 0.72, discFraction * 1.06, radius);
  float intensity = spread * mix(0.16, 1.0, outsideDisc) * glareIntensity;

  intensity *= 0.94 + 0.06 * sin(time * 0.35);

  if (intensity <= 0.002) discard;
  vec3 tint = starClipToWhite(glareColor, intensity);
  gl_FragColor = vec4(tint, clamp(intensity, 0.0, 1.0));
}`;

let shadersRegistered = false;

const registerStarShaders = (): void => {
  if (shadersRegistered) return;
  shadersRegistered = true;
  Effect.ShadersStore.exoraStarGlareVertexShader = GLARE_VERTEX_SHADER;
  Effect.ShadersStore.exoraStarGlareFragmentShader = GLARE_FRAGMENT_SHADER;
};

const QUAD_CORNERS = [-1, -1, 1, -1, -1, 1, 1, 1] as const;

export interface StarfieldOptions {
  count: number;
  distance?: number;
  scene: Scene;
  seed: number;
  viewpoint?: SkyViewpoint | null;
}

export type StarfieldSource = "catalog" | "seeded";

export interface Starfield {
  dispose: () => void;
  mesh: Mesh;
  source: () => StarfieldSource | "pending";
  update: (elapsedSeconds: number, viewerPosition: Vector3) => void;
}

const DEFAULT_SHELL_RADIUS = 90;

const seededSky = (
  count: number,
  distance: number,
  seed: number,
): { colors: Float32Array; positions: Float32Array } => {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);

  let state = seed >>> 0 || 1;
  const random = (): number => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };

  for (let index = 0; index < count; index += 1) {
    const radius = distance * (0.78 + random() * 0.5);
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    const brightness = 0.25 + random() * 0.75;
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.cos(phi);
    positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    colors[index * 4] = brightness * 0.72;
    colors[index * 4 + 1] = brightness * 0.85;
    colors[index * 4 + 2] = brightness;
    colors[index * 4 + 3] = 1;
  }

  return { colors, positions };
};

export const createStarfield = ({
  count,
  distance = DEFAULT_SHELL_RADIUS,
  scene,
  seed,
  viewpoint = null,
}: StarfieldOptions): Starfield => {
  const mesh = markAsVirtualBackground(new Mesh("starfield", scene));

  const material = new StandardMaterial("starfield-material", scene);
  material.disableLighting = true;
  material.emissiveColor = Color3.White();
  material.pointsCloud = true;
  material.pointSize = 1.65;
  material.disableDepthWrite = true;
  material.freeze();
  mesh.material = material;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;

  let disposed = false;
  let source: StarfieldSource | "pending" = viewpoint ? "pending" : "seeded";

  const applyPoints = (positions: Float32Array, colors: Float32Array): void => {
    const drawn = positions.length / 3;
    const indices = new Uint32Array(drawn);
    for (let index = 0; index < drawn; index += 1) indices[index] = index;

    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.colors = colors;
    vertexData.indices = indices;
    vertexData.applyToMesh(mesh);
  };

  const applySeeded = (): void => {
    const { colors, positions } = seededSky(count, distance, seed);
    applyPoints(positions, colors);
    source = "seeded";
  };

  if (viewpoint) {
    void loadSkyCatalog().then((catalog) => {
      if (disposed || mesh.isDisposed()) return;
      if (!catalog) {
        applySeeded();
        return;
      }
      const projected = projectSky(catalog, viewpoint, {
        shellRadius: distance,
        starLimit: count,
      });
      applyPoints(projected.positions, projected.colors);
      source = "catalog";
    });
  } else {
    applySeeded();
  }

  return {
    mesh,
    source: () => source,
    update: (_elapsedSeconds: number, viewerPosition: Vector3): void => {
      mesh.position.copyFrom(viewerPosition);
    },
    dispose: (): void => {
      disposed = true;
      mesh.dispose(false, true);
    },
  };
};

export interface StarGlareOptions {
  color: Color3;
  diameter: number;
  intensity: number;
  parent?: TransformNode;
  position: Vector3;
  renderingGroupId?: number;
  scene: Scene;
  spread?: number;
  spikes: number;
}

export interface StarGlare {
  dispose: () => void;
  mesh: Mesh;
  update: (elapsedSeconds: number) => void;
}

export const createStarGlare = ({
  color,
  diameter,
  intensity,
  parent,
  position,
  renderingGroupId = 1,
  scene,
  spikes,
  spread = 3.4,
}: StarGlareOptions): StarGlare => {
  registerStarShaders();

  const mesh = new Mesh("star-glare", scene);
  const positions = new Float32Array(12);
  const corners = new Float32Array(QUAD_CORNERS);
  for (let vertex = 0; vertex < 4; vertex += 1) {
    positions[vertex * 3] = 0;
    positions[vertex * 3 + 1] = 0;
    positions[vertex * 3 + 2] = 0;
  }
  mesh.setVerticesData("position", positions, false, 3);
  mesh.setVerticesData("corner", corners, false, 2);
  mesh.setIndices(new Uint32Array([0, 1, 2, 1, 3, 2]));
  if (parent) mesh.parent = parent;
  mesh.position.copyFrom(position);
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.applyFog = false;
  mesh.renderingGroupId = renderingGroupId;

  const glareRadius = diameter * 0.5 * spread;
  const material = new ShaderMaterial(
    "star-glare-material",
    scene,
    { vertex: "exoraStarGlare", fragment: "exoraStarGlare" },
    {
      attributes: ["position", "corner"],
      uniforms: [
        "worldView",
        "projection",
        "time",
        "glareRadius",
        "glareScale",
        "glareIntensity",
        "glareColor",
        "spikeStrength",
        "discFraction",
        "depthOffset",
      ],
      needAlphaBlending: true,
    },
  );
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.setFloat("glareRadius", glareRadius);
  material.setFloat("glareScale", 1);
  material.setFloat("glareIntensity", intensity);
  material.setColor3("glareColor", color);
  material.setFloat("spikeStrength", spikes);
  material.setFloat("discFraction", 1 / spread);
  material.setFloat("depthOffset", diameter * 0.55);
  material.setFloat("time", 0);
  mesh.material = material;

  return {
    mesh,
    update: (elapsedSeconds: number): void => {
      mesh.computeWorldMatrix(true);
      const absoluteScale = mesh.absoluteScaling;
      material.setFloat(
        "glareScale",
        Math.max(Math.abs(absoluteScale.x), Math.abs(absoluteScale.y), Math.abs(absoluteScale.z)),
      );
      material.setFloat("time", elapsedSeconds);
    },
    dispose: (): void => {
      mesh.dispose(false, true);
    },
  };
};
