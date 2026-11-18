import type { ExoplanetProfile } from "@exora/contracts";
import type { WorldRecipe, Rgb } from "@exora/worldgen";
import {
  Color,
  SRGBColorSpace,
  DoubleSide,
  RingGeometry,
  Group,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Texture,
  Vector3,
} from "three";
import vertexShader from "./globe.vert?raw";
import fragmentShader from "./globe.frag?raw";

const linearColor = (color: Rgb) => new Color().setRGB(...color, SRGBColorSpace);

export function createPlanetGlobe(
  recipe: WorldRecipe,
  strata: Texture,
  flow: Texture,
  segments: number,
  {
    drawRings = true,
    identity,
  }: { drawRings?: boolean; identity?: ExoplanetProfile["solarSystem"] } = {},
) {
  const rocky = recipe.renderer === "rocky" ? recipe.surface : null;
  const palette =
    recipe.renderer === "rocky"
      ? recipe.surface
      : recipe.renderer === "gas-giant"
        ? recipe.cloudBands
        : recipe.atmosphereBands;
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      strata: { value: strata },
      flow: { value: flow },
      lowColor: {
        value: linearColor("lowColor" in palette ? palette.lowColor : palette.deepColor),
      },
      midColor: {
        value: linearColor("midColor" in palette ? palette.midColor : palette.hazeColor),
      },
      highColor: {
        value: linearColor("highColor" in palette ? palette.highColor : palette.lightColor),
      },
      waterColor: { value: linearColor(rocky?.waterColor ?? ([0, 0, 0] as const)) },
      airColor: { value: linearColor(recipe.atmosphere.color) },
      sunlight: { value: linearColor(recipe.star.color) },
      lightDirection: { value: new Vector3() },
      unresolved: {
        value: identity?.surfaceStatus === "unresolved" || identity?.surfaceStatus === "modeled",
      },
      seed: { value: recipe.seed / 4294967296 },
      air: { value: recipe.atmosphere.scatterStrength * recipe.atmosphere.density },
      cloud: { value: rocky?.cloudCover ?? 0 },
      lava: { value: rocky?.lavaStrength ?? 0 },
      water: { value: rocky?.waterLevel ?? 0 },
      ice: { value: rocky?.iceCapStrength ?? 0 },
      contrast: { value: recipe.renderer === "rocky" ? 0 : recipe.bandDetail.bandContrast },
      warp: { value: recipe.renderer === "rocky" ? 0 : recipe.bandDetail.bandWarp },
      bands: { value: recipe.renderer === "rocky" ? 0 : recipe.bandDetail.bandCount * Math.PI },
      stormLatitude: { value: "stormLatitude" in palette ? palette.stormLatitude : 0 },
      stormStrength: { value: "stormStrength" in palette ? palette.stormStrength : 0 },
      stormColor: {
        value: linearColor(
          "stormColor" in palette
            ? palette.stormColor
            : "hazeColor" in palette
              ? palette.hazeColor
              : palette.highColor,
        ),
      },
      time: { value: 0 },
    },
  });
  const geometry = new SphereGeometry(
    recipe.radiusSceneUnits,
    segments,
    Math.max(8, Math.ceil(segments / 2)),
  );
  const body = new Mesh(geometry, material);
  const axes = identity?.dimensionsKilometers;
  if (axes) {
    const [long, intermediate, polar] = axes;
    const mean = Math.cbrt(long * intermediate * polar);
    body.scale.set(long / mean, polar / mean, intermediate / mean);
  }
  const root = new Group();
  root.rotation.z = recipe.axialTilt;
  root.add(body);
  const rings = drawRings && recipe.rings?.opacity ? recipe.rings : null;
  const ring =
    rings &&
    new Mesh(
      new RingGeometry(rings.innerRadius, rings.outerRadius, segments * 2),
      new ShaderMaterial({
        uniforms: {
          dust: { value: linearColor(rings.color) },
          innerRadius: { value: rings.innerRadius },
          outerRadius: { value: rings.outerRadius },
          opacity: { value: rings.opacity },
          bands: { value: rings.bands },
          gap: { value: rings.gapiness },
        },
        vertexShader: `varying vec2 plane;
        void main(){plane = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);}`,
        fragmentShader: `uniform vec3 dust;
        uniform float innerRadius, outerRadius, opacity, bands, gap;
        varying vec2 plane;
        void main(){
          float u = (length(plane) - innerRadius) / (outerRadius - innerRadius);
          float lane = sin(u * bands * 6.283 + sin(u * 53.) * .8);
          float split = smoothstep(.005, .024, abs(u - .69));
          float density = (.62 + .24 * lane + .12 * sin(u * 159.)) * mix(1., split, gap);
          gl_FragColor = vec4(dust * (.65 + .65 * density), density * opacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
  if (ring) {
    ring.rotation.x = -Math.PI / 2;
    root.add(ring);
  }
  const sun = new Vector3(-0.72, 0.39, 0.58).normalize();
  body.onBeforeRender = (_renderer, _scene, camera) => {
    material.uniforms.lightDirection!.value.copy(sun).transformDirection(camera.matrixWorldInverse);
  };
  return {
    root,
    setLightDirection(direction: Vector3) {
      sun.copy(direction);
    },
    extent: Math.max(
      rings?.outerRadius ?? 0,
      recipe.radiusSceneUnits * Math.max(body.scale.x, body.scale.y, body.scale.z),
    ),
    update(seconds: number, spin = recipe.rotationSpeed) {
      body.rotation.y = seconds * spin;
      material.uniforms.time!.value = seconds;
    },
    dispose() {
      root.removeFromParent();
      ring?.geometry.dispose();
      ring?.material.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
