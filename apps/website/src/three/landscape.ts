import type { ExoplanetProfile } from "@exora/contracts";
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
import skyFragment from "./surface-sky.frag?raw";
import { createHorizonPlanet } from "./moon-horizon.ts";
import { createShoreline } from "./shoreline.ts";
import { createCloudHeights } from "./cloud-deck.ts";
import { SURFACE_HALF_EXTENT } from "../surface-vista-baking.ts";
import { createLandmarks } from "./landmarks.ts";
import { createOutcrops } from "./outcrops.ts";

export const siteSun = (seed: number) => {
  const { x, z } = sitePosition(seed, -0.94, -0.17);
  return new Vector3(x, 0.42, z).normalize();
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
  weather = texture,
  planet?: ExoplanetProfile,
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
  const floorAt = (x: number, z: number) =>
    Math.max(water, terrainFloor(x, z)) + (cloudDeck ? 4.5 : 0);
  const geometry =
    terrain && !cloudDeck
      ? new BufferGeometry()
          .setAttribute("position", new BufferAttribute(terrain.data.positions, 3))
          .setAttribute("masks", new BufferAttribute(terrain.data.colors, 4))
          .setAttribute("shade", new BufferAttribute(terrain.data.shade, 2))
          .setIndex(new BufferAttribute(terrain.data.indices, 1))
      : new PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();

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
        strata: { value: geology?.strataStrength ?? 0 },
        strataSpacing: { value: Math.max(0.24, (geology?.strataSpacing ?? 1) * 0.42) },
        datum: { value: Number.isFinite(water) ? water : -1000 },
      },
      vertexShader: landscapeVertex,
      fragmentShader: landscapeFragment,
    }),
  );
  ground.castShadow = ground.receiveShadow = !!terrain && !cloudDeck;
  if (!cloudDeck) root.add(ground);
  const sea =
    terrain && Number.isFinite(water)
      ? createShoreline(terrain, water, constrained, skyTint, sunLight, surfaceSunDirection, time)
      : null;
  if (sea) root.add(sea);
  const cloudHeights = terrain && cloudDeck ? createCloudHeights(terrain.data, terrainFloor) : null;
  const sky = new Mesh(
    new SphereGeometry(760, 40, 28),
    new ShaderMaterial({
      side: BackSide,
      defines: cloudHeights ? { CLOUD_STEPS: constrained ? 16 : 26 } : {},
      transparent: true,
      depthWrite: false,
      uniforms: {
        air: { value: air },
        time,
        cover: {
          value: cloudDeck ? 0.85 : recipe.renderer === "rocky" ? recipe.surface.cloudCover : 0,
        },
        weather: { value: weather },
        cloudHeights: { value: cloudHeights },
        heightRange: { value: new Vector2(terrain?.data.low ?? 0, terrain?.data.high ?? 1) },
        cloudExtent: { value: SURFACE_HALF_EXTENT },
        cloudLight: { value: ramp[4] },
        cloudDark: { value: ramp[0] },
        seedOffset: { value: new Vector2(offset, offset * 2.89) },
        skyTint: { value: skyTint },
        sunTint: { value: sunLight },
        sunDirection: { value: surfaceSunDirection },
      },
      vertexShader:
        "varying vec3 bearing;void main(){bearing=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: skyFragment,
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
  const parent =
    terrain && air < 0.5
      ? createHorizonPlanet(planet, recipe.seed, texture, weather, surfaceSunDirection)
      : null;
  if (parent) root.add(parent.root);

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
  const landing = sitePosition(recipe.seed, 0, -7);
  if (terrain && Number.isFinite(water)) {
    for (const across of [-8, 8, -14, 14, -23, 23]) {
      if (terrainFloor(landing.x, landing.z) > water + 0.3) break;
      Object.assign(landing, sitePosition(recipe.seed, across, -11));
    }
  }
  return {
    follow(x: number, z: number) {
      sky.position.set(x, 0, z);
      parent?.follow(x, z);
      star.position.set(sunOffset.x + x, sunOffset.y, sunOffset.z + z);
    },
    root,
    star,
    floorAt,
    blocks: formations?.blocks,
    landing: { ...landing, yaw: siteBearing(recipe.seed) },
    update(delta: number) {
      time.value += delta;
    },
    setScans(sediment: Texture, cliff: Texture) {
      ground.material.uniforms.detail!.value = sediment;
      ground.material.uniforms.cliffScan!.value = cliff;
      ground.material.uniforms.hasScans!.value = true;
    },
    dispose() {
      cloudHeights?.dispose();
      parent?.dispose();
      formations?.dispose();
      clearRocks?.();
      sunlight.dispose();
      sea?.geometry.dispose();
      sea?.dispose();
      for (const mesh of [ground, sky, star]) {
        mesh?.geometry.dispose();
        mesh?.material.dispose();
      }
      root.removeFromParent();
    },
  };
}
