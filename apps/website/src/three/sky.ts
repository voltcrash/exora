import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  ShaderMaterial,
} from "three";
import { loadSkyCatalog, projectSky, type SkyViewpoint } from "../sky-catalog.ts";

export function createNightSky(count: number, seed: number, viewpoint?: SkyViewpoint | null) {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const xyz = new Float32Array(count * 3),
    rgb = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const lat = random() * 2 - 1,
      phi = random() * 2 * Math.PI,
      s = Math.sqrt(1 - lat * lat);
    xyz.set([s * Math.cos(phi) * 900, lat * 900, s * Math.sin(phi) * 900], i * 3);
    const energy = 0.07 + 0.88 * Math.pow(random(), 4),
      temp = random();
    rgb.set([energy * (0.75 + 0.25 * temp), energy * 0.84, energy * (1.05 - 0.33 * temp)], i * 3);
  }
  const geo = new BufferGeometry();
  const set = (positions: Float32Array, colors: Float32Array, drawn: number) => {
    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new Float32BufferAttribute(colors, 3));
    geo.setDrawRange(0, drawn);
  };
  set(xyz, rgb, count);
  const mat = new ShaderMaterial({
    vertexColors: true,
    depthWrite: false,
    transparent: true,
    blending: AdditiveBlending,
    vertexShader: `varying vec3 tint;void main(){tint=color;vec4 clip=projectionMatrix*vec4(mat3(viewMatrix)*position,1.);
      gl_Position=clip.xyww;gl_PointSize=1.+1.9*max(color.r,color.b);}`,
    fragmentShader: `varying vec3 tint;void main(){gl_FragColor=vec4(tint,1.-smoothstep(.02,.5,length(gl_PointCoord-.5)));
      #include <colorspace_fragment>
    }`,
  });
  const mesh = new Points(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  let disposed = false;
  if (viewpoint)
    void loadSkyCatalog().then((catalog) => {
      if (!catalog || disposed) return;
      const projected = projectSky(catalog, viewpoint, { shellRadius: 900, starLimit: count });
      geo.dispose();
      set(projected.positions, projected.colors, projected.drawn);
    });
  return {
    mesh,
    dispose() {
      disposed = true;
      mesh.removeFromParent();
      geo.dispose();
      mat.dispose();
    },
  };
}
