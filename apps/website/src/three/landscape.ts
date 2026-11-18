import type { WorldRecipe } from "@exora/worldgen";
import {
  BackSide,
  BufferAttribute,
  Color,
  BufferGeometry,
  Float32BufferAttribute,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
} from "three";

import { createOutcrops } from "./outcrops.ts";

export function createLandscape(
  recipe: WorldRecipe,
  texture: Texture,
  segments: number,
  neutralSurface = false,
) {
  const root = new Group();
  const image = texture.image as HTMLImageElement;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const offset = recipe.seed / 4294967296;
  function field(x: number, z: number, channel: number) {
    const ix = ((((x / 138 + offset) % 1) + 1) % 1) * image.width;
    const iz = ((((z / 144 + offset * 2.89) % 1) + 1) % 1) * image.height;
    const u = Math.floor(ix),
      v = Math.floor(iz),
      fx = ix - u,
      fz = iz - v;
    const sample = (a: number, b: number) =>
      data[((b % image.height) * image.width + (a % image.width)) * 4 + channel]! / 255;
    return (
      (sample(u, v) * (1 - fx) + sample(u + 1, v) * fx) * (1 - fz) +
      (sample(u, v + 1) * (1 - fx) + sample(u + 1, v + 1) * fx) * fz
    );
  }
  const rocky = recipe.renderer === "rocky" ? recipe.surface : null;
  const relief = recipe.renderer === "rocky" ? 3.5 + recipe.terrain.mountainHeight * 8 : 3.1;
  const baseHeight = (x: number, z: number) => {
    if (neutralSurface) return 0;
    const basin = Math.min(1, Math.hypot(x, z - 5) / 36);
    const dunes = field(x * 0.24, z * 0.24, 0) - 0.48;
    const hills = field(x * 0.36, z * 0.36, 1);
    return (dunes * 0.48 + basin * basin * hills * 0.28 + field(x, z, 2) * 0.019) * relief;
  };
  const water = rocky && rocky.waterLevel > 0 ? (rocky.waterLevel - 0.45) * relief : -Infinity;

  const geo = new PlaneGeometry(
    neutralSurface ? 4000 : 136,
    neutralSurface ? 4000 : 136,
    neutralSurface ? 1 : segments,
    neutralSurface ? 1 : segments,
  ).rotateX(-Math.PI / 2);
  const pos = geo.getAttribute("position"),
    colors = new Float32Array(pos.count * 3);
  const palette =
    recipe.renderer === "rocky"
      ? recipe.surface
      : recipe.renderer === "gas-giant"
        ? recipe.cloudBands
        : recipe.atmosphereBands;
  const low = new Color().setRGB(
    ...("lowColor" in palette ? palette.lowColor : palette.deepColor),
    SRGBColorSpace,
  );
  const high = new Color().setRGB(
    ...("highColor" in palette ? palette.highColor : palette.lightColor),
    SRGBColorSpace,
  );
  const color = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      z = pos.getZ(i);
    const h = baseHeight(x, z);
    pos.setY(i, h);
    color
      .copy(low)
      .lerp(
        high,
        neutralSurface
          ? 0.5
          : Math.min(1, Math.max(0, 0.2 + (h / relief) * 0.65 + field(x, z, 2) * 0.38)),
      )
      .toArray(colors, i * 3);
  }
  geo.setAttribute("color", new BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  // Interpolate the same two triangles as PlaneGeometry so the camera tracks the rendered ground.
  function floorAt(x: number, z: number) {
    if (neutralSurface) return 0;
    const col = (x / 136 + 0.5) * segments,
      row = (z / 136 + 0.5) * segments;
    const c = Math.min(segments - 1, Math.max(0, Math.floor(col))),
      r = Math.min(segments - 1, Math.max(0, Math.floor(row)));
    const u = col - c,
      v = row - r,
      a = r * (segments + 1) + c;
    const north = pos.getY(a + 1),
      west = pos.getY(a + segments + 1);
    return Math.max(
      water,
      u + v <= 1
        ? pos.getY(a) * (1 - u - v) + north * u + west * v
        : north * (1 - v) + west * (1 - u) + pos.getY(a + segments + 2) * (u + v - 1),
    );
  }
  const haze = new Color()
    .setRGB(...recipe.atmosphere.color, SRGBColorSpace)
    .lerp(high, 0.42)
    .multiplyScalar(0.65);
  const ground = new Mesh(
    geo,
    new ShaderMaterial({
      uniforms: {
        detail: { value: texture },
        neutral: { value: neutralSurface },
        horizon: { value: haze },
        keyColor: { value: new Color().setRGB(...recipe.star.color, SRGBColorSpace) },
        air: { value: Math.min(1, recipe.atmosphere.density + 0.11) },
      },
      vertexColors: true,
      vertexShader: `varying vec3 point,slope,tint;void main(){point=position;slope=normal;tint=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform bool neutral;uniform sampler2D detail;uniform vec3 horizon,keyColor;uniform float air;varying vec3 point,slope,tint;
      void main(){vec2 uv=point.xz;vec3 fines=texture2D(detail,fract(uv*.038)).rgb;
        float grit=texture2D(detail,fract(uv*.28)).b;float rake=sin(uv.y*6.+fines.r*8.+.6*sin(uv.x*1.9));
        float lambert=max(0.,dot(normalize(slope),normalize(vec3(-.55,.24,-.8))));
        vec3 clay=neutral ? tint : tint*(.66+.42*fines.b+.32*grit+.05*rake);
        float veil=1.-exp(-length(cameraPosition-point)*(.005+.012*air));
        gl_FragColor=vec4(mix(clay*(.44+1.5*lambert)*keyColor,horizon,veil*.78),1.);
        #include <colorspace_fragment>
      }`,
    }),
  );
  const ridges = Array.from({ length: neutralSurface ? 0 : 3 }, (_, layer) => {
    const vertices: number[] = [],
      indices: number[] = [];
    for (let i = 0; i <= 360; i++) {
      const a = (i * Math.PI) / 180,
        r = 76 + 14 * layer,
        x = r * Math.cos(a),
        z = r * Math.sin(a);
      const shale = field(x * 0.21 + layer * 14, z * 0.21 - layer * 11, 0);
      const crest = rocky
        ? relief * (0.3 + 0.36 * layer + 1.4 * shale + 0.25 * field(x * 0.5, z * 0.5, 2))
        : relief * (0.4 + shale);
      vertices.push(x, -11, z, x, crest, z);
      if (i > 0) {
        let j = i * 2;
        indices.push(j - 2, j - 1, j, j - 1, j + 1, j);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    const mesh = new Mesh(
      geometry,
      new MeshBasicMaterial({
        color: high
          .clone()
          .lerp(haze, 0.46 + 0.16 * layer)
          .multiplyScalar(0.54 + 0.11 * layer),
        side: BackSide,
      }),
    );
    root.add(mesh);
    return mesh;
  });
  root.add(ground);
  const sea =
    rocky && Number.isFinite(water)
      ? new Mesh(
          new PlaneGeometry(136, 136).rotateX(-Math.PI / 2),
          new MeshStandardMaterial({
            color: new Color().setRGB(...rocky.waterColor, SRGBColorSpace),
            roughness: 0.22,
            metalness: 0.13,
          }),
        )
      : null;
  if (sea) {
    sea.position.y = water;
    root.add(sea);
  }
  const air = new Color().setRGB(...recipe.atmosphere.color, SRGBColorSpace);
  const sun = new Color().setRGB(...recipe.star.color, SRGBColorSpace);
  const sky = new Mesh(
    new SphereGeometry(160, 40, 28),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: recipe.atmosphere.density > 0.03,
      uniforms: {
        air: { value: air },
        sun: { value: sun },
        density: { value: recipe.atmosphere.density },
      },
      vertexShader:
        "varying vec3 bearing;void main(){bearing=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: `varying vec3 bearing;uniform vec3 air,sun;uniform float density;void main(){
    vec3 p=normalize(bearing);float altitude=max(0.,p.y);float haze=exp(-altitude*6.);
    float beam=max(0.,dot(p,normalize(vec3(-.55,.24,-.8))));
    vec3 c=air*(.045+.48*haze)*density+sun*pow(beam,14.)*(.22*haze*density);
    gl_FragColor=vec4(c,1.);
    #include <colorspace_fragment>
    }`,
    }),
  );
  const star = new Mesh(
    new SphereGeometry(
      Math.max(0.25, Math.min(8, 135 * Math.tan(recipe.star.apparentRadiusRadians))),
      32,
      20,
    ),
    new MeshBasicMaterial({ color: sun }),
  );
  star.position.set(-0.55, 0.24, -0.8).normalize().multiplyScalar(135);
  root.add(sky, star);
  const sunlight = new DirectionalLight(sun, 2.15);
  sunlight.position.set(-0.55, 0.24, -0.8);
  root.add(sunlight, new HemisphereLight(air.clone().lerp(new Color("white"), 0.55), low, 0.9));
  const clearRocks =
    rocky && !neutralSurface
      ? createOutcrops(root, recipe.seed, high, rocky.iceCapStrength > 0.7, floorAt, water)
      : null;
  const sunOffset = star.position.clone();
  return {
    follow(x: number, z: number) {
      sky.position.set(x, 0, z);
      star.position.copy(sunOffset);
      star.position.x += x;
      star.position.z += z;
    },
    root,
    star,
    floorAt,
    dispose() {
      clearRocks?.();
      for (const mesh of [ground, sea, sky, star, ...ridges]) {
        mesh?.geometry.dispose();
        mesh?.material.dispose();
      }
      root.removeFromParent();
    },
  };
}
