import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Matrix4,
  ShaderMaterial,
  UnsignedByteType,
  type Vector3,
} from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import type { LandscapeTerrain } from "./landscape.ts";
import fragmentShader from "./shoreline.frag?raw";

export function createShoreline(
  terrain: LandscapeTerrain,
  water: number,
  constrained: boolean,
  sky: Color,
  sun: Color,
  direction: Vector3,
  time: { value: number },
) {
  const { data, geology } = terrain;
  const plane = new Float32Array(data.positions.length);
  for (let i = 0; i < data.heights.length; i++) {
    plane[i * 3] = data.positions[i * 3]!;
    plane[i * 3 + 1] = -data.positions[i * 3 + 2]!;
  }
  const indices: number[] = [];
  for (let i = 0; i < data.indices.length; i += 3) {
    const a = data.indices[i]!,
      b = data.indices[i + 1]!,
      c = data.indices[i + 2]!;
    if (Math.min(data.heights[a]!, data.heights[b]!, data.heights[c]!) < water)
      indices.push(a, b, c);
  }
  if (indices.length === 0) return null;
  const geometry = new BufferGeometry()
    .setAttribute("position", new BufferAttribute(plane, 3))
    .setAttribute("seabed", new BufferAttribute(data.heights, 1))
    .setIndex(indices);
  const mesh = new Reflector(geometry, {
    textureWidth: constrained ? 256 : 512,
    textureHeight: constrained ? 256 : 512,
    multisample: 0,
    clipBias: 0.001,
    shader: {
      uniforms: {
        textureMatrix: { value: new Matrix4() },
        tDiffuse: { value: null },
        color: { value: new Color() },
        time,
        datum: { value: water },
        air: { value: geology.hazeDensity },
        deepColor: { value: new Color().setRGB(...geology.liquidColor) },
        shallowColor: { value: new Color().setRGB(...geology.liquidShallowColor) },
        skyTint: { value: sky },
        sunTint: { value: sun },
        sunDirection: { value: direction },
      },
      vertexShader: `
        uniform mat4 textureMatrix;
        uniform float datum;
        attribute float seabed;
        varying vec3 waterPoint;
        varying vec4 reflectionUV;
        varying float depth;
        void main() {
          waterPoint = (modelMatrix * vec4(position, 1.)).xyz;
          depth = datum - seabed;
          reflectionUV = textureMatrix * vec4(position, 1.);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
        }
      `,
      fragmentShader,
    },
  });
  mesh.getRenderTarget().texture.type = UnsignedByteType;
  (mesh.material as ShaderMaterial).uniforms.time = time;
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = water;
  mesh.raycast = () => {};
  return mesh;
}
