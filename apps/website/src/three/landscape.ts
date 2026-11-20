import type { Rgb, WorldRecipe } from "@exora/worldgen";
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  UniformsLib,
  UniformsUtils,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  type Texture,
} from "three";

import { siteBearing, sitePosition } from "../surface-landing.ts";
import type { SurfaceGeology } from "../surface-geology.ts";
import { createSurfaceFloor, type SurfaceTerrainData } from "../surface-terrain-kernel.ts";
import landscapeFragment from "./landscape.frag?raw";
import landscapeVertex from "./landscape.vert?raw";
import shorelineFragment from "./shoreline.frag?raw";
import { createLandmarks } from "./landmarks.ts";
import { createOutcrops } from "./outcrops.ts";

export const siteSun = (seed: number) => {
  const { x, z } = sitePosition(seed, -0.84, -0.38);
  return new Vector3(x, 0.52, z).normalize();
};
const sunDistance = 620;
const color = (rgb: Rgb) => new Color().setRGB(...rgb);

export interface LandscapeTerrain {
  geology: SurfaceGeology;
  data: SurfaceTerrainData;
}

export function createLandscape(
  recipe: WorldRecipe,
  texture: Texture,
  terrain: LandscapeTerrain | null,
  constrained = false,
) {
  const root = new Group();
  const surfaceSunDirection = siteSun(recipe.seed);
  const geology = terrain?.geology;
  const cloudDeck = geology?.medium === "cloud";
  const air = geology?.hazeDensity ?? 0;
  const skyTint = geology ? color(geology.skyColor) : new Color(0);
  const sunTint = new Color().setRGB(...recipe.star.color, SRGBColorSpace);
  const sunLight = sunTint.clone().lerp(new Color(1, 1, 1), 0.42);
  const neutralColor = new Color(0.29, 0.31, 0.33);
  const ramp = geology?.ramp.map(color) ?? Array<Color>(5).fill(neutralColor);
  const water =
    geology && geology.liquidLevel !== null
      ? (geology.liquidLevel - 0.42) * geology.relief * 1.15
      : -Infinity;
  const terrainFloor = terrain ? createSurfaceFloor(terrain.data) : () => 0;
  const floorAt = (x: number, z: number) => Math.max(water, terrainFloor(x, z));
  const geometry = terrain
    ? new BufferGeometry()
        .setAttribute("position", new BufferAttribute(terrain.data.positions, 3))
        .setAttribute("masks", new BufferAttribute(terrain.data.colors, 4))
        .setAttribute("shade", new BufferAttribute(terrain.data.shade, 2))
        .setIndex(new BufferAttribute(terrain.data.indices, 1))
    : new PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();

  const wind = geology?.windDirection ?? 0;
  const offset = recipe.seed / 4_294_967_296;
  const time = { value: 0 };
  const ground = new Mesh(
    geometry,
    new ShaderMaterial({
      lights: true,
      uniforms: {
        ...UniformsUtils.clone(UniformsLib.lights),
        time,
        cliffScan: { value: texture },
        hasScans: { value: false },
        lavaGlow: { value: geology?.lavaGlow ?? 0 },
        detail: { value: texture },
        detailOffset: { value: new Vector2(offset, offset * 2.89) },
        ramp: { value: ramp },
        regolith: { value: geology ? color(geology.regolithColor) : neutralColor },
        bedrock: { value: geology ? color(geology.bedrockColor) : neutralColor },
        frost: { value: geology ? color(geology.frostColor) : neutralColor },
        lava: { value: geology ? color(geology.lavaColor) : neutralColor },
        skyTint: { value: skyTint },
        sunTint: { value: sunLight },
        sunDirection: { value: surfaceSunDirection },
        air: { value: air },
        neutral: { value: !terrain },
        cloudDeck: { value: cloudDeck },
        relief: { value: geology?.relief ?? 1 },
        strata: { value: geology?.strataStrength ?? 0 },
        strataSpacing: { value: Math.max(0.24, (geology?.strataSpacing ?? 1) * 0.42) },
        datum: { value: Number.isFinite(water) ? water : -1000 },
        windDirection: { value: new Vector2(Math.cos(wind), Math.sin(wind)) },
        windStreaks: { value: geology?.windStreaks ?? 0 },
      },
      vertexShader: landscapeVertex,
      fragmentShader: landscapeFragment,
    }),
  );
  ground.castShadow = ground.receiveShadow = !!terrain && !cloudDeck;
  root.add(ground);
  const sea =
    terrain && Number.isFinite(water)
      ? new Mesh(
          new BufferGeometry()
            .setAttribute("position", new BufferAttribute(terrain.data.positions, 3))
            .setIndex(new BufferAttribute(terrain.data.indices, 1)),
          new ShaderMaterial({
            uniforms: {
              time,
              datum: { value: water },
              deepColor: { value: color(terrain.geology.liquidColor) },
              shallowColor: { value: color(terrain.geology.liquidShallowColor) },
              skyTint: { value: skyTint },
              sunTint: { value: sunLight },
              sunDirection: { value: surfaceSunDirection },
              air: { value: air },
            },
            vertexShader: `
              uniform float datum;
              varying vec3 waterPoint;
              varying float depth;
              void main() {
                waterPoint = vec3(position.x, datum, position.z);
                depth = datum - position.y;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(waterPoint, 1.);
              }
            `,
            fragmentShader: shorelineFragment,
          }),
        )
      : null;
  if (sea) {
    sea.raycast = () => {};
    root.add(sea);
  }
  const sky = new Mesh(
    new SphereGeometry(760, 40, 28),
    new ShaderMaterial({
      side: BackSide,
      transparent: true,
      depthWrite: false,
      uniforms: {
        air: { value: air },
        skyTint: { value: skyTint },
        sunTint: { value: sunLight },
        sunDirection: { value: surfaceSunDirection },
      },
      vertexShader:
        "varying vec3 bearing;void main(){bearing=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: `varying vec3 bearing;uniform vec3 skyTint,sunTint,sunDirection;uniform float air;
      void main() {
        vec3 p = normalize(bearing);
        float altitude = max(0., p.y);
        float horizon = exp(-altitude * 5.2);
        float beam = max(0., dot(p, sunDirection));
        vec3 tint = skyTint * (.15 + .51 * horizon);
        tint += sunTint * (pow(beam, 18.) * .12 + pow(beam, 240.) * .22) * air;
        gl_FragColor = vec4(tint, 1. - exp(-air * (2.4 + 6. * horizon)));
        #include <colorspace_fragment>
      }`,
    }),
  );
  const star = new Mesh(
    new SphereGeometry(
      Math.max(0.65, Math.min(26, sunDistance * Math.tan(recipe.star.apparentRadiusRadians))),
      32,
      20,
    ),
    new MeshBasicMaterial({ color: sunTint.clone().lerp(new Color(1, 1, 1), 0.25) }),
  );
  const sunOffset = surfaceSunDirection.clone().multiplyScalar(sunDistance);
  star.position.copy(sunOffset);
  root.add(star);
  if (air > 0) root.add(sky);

  const sunlight = new DirectionalLight(sunLight, 2.35);
  sunlight.position.copy(surfaceSunDirection).multiplyScalar(160);
  sunlight.castShadow = !!terrain && !cloudDeck;
  sunlight.shadow.mapSize.setScalar(constrained ? 512 : 1024);
  Object.assign(sunlight.shadow.camera, {
    left: -74,
    right: 74,
    top: 80,
    bottom: -76,
    near: 25,
    far: 325,
  });
  sunlight.shadow.camera.updateProjectionMatrix();
  sunlight.shadow.autoUpdate = false;
  sunlight.shadow.normalBias = 0.09;
  sunlight.shadow.bias = -0.0003;
  const updateShadows = () => {
    sunlight.shadow.needsUpdate = true;
  };
  updateShadows();
  const formations =
    geology?.medium === "rock"
      ? createLandmarks(root, geology, terrainFloor, ground.material, updateShadows)
      : null;
  root.add(
    sunlight,
    new HemisphereLight(skyTint.clone().lerp(new Color(1, 1, 1), 0.62), ramp[1]!, 0.82),
  );
  const clearRocks =
    geology?.medium === "rock"
      ? createOutcrops(root, geology, terrainFloor, water, constrained, updateShadows)
      : null;
  return {
    follow(x: number, z: number) {
      sky.position.set(x, 0, z);
      star.position.set(sunOffset.x + x, sunOffset.y, sunOffset.z + z);
    },
    root,
    star,
    floorAt,
    blocks: formations?.blocks,
    landing: { ...sitePosition(recipe.seed, 0, -7), yaw: siteBearing(recipe.seed) },
    update(delta: number) {
      time.value += delta;
    },
    setScans(sediment: Texture, cliff: Texture) {
      ground.material.uniforms.detail!.value = sediment;
      ground.material.uniforms.cliffScan!.value = cliff;
      ground.material.uniforms.hasScans!.value = true;
    },
    dispose() {
      formations?.dispose();
      clearRocks?.();
      sunlight.dispose();
      for (const mesh of [ground, sea, sky, star]) {
        mesh?.geometry.dispose();
        mesh?.material.dispose();
      }
      root.removeFromParent();
    },
  };
}
