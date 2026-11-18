import {
  BackSide,
  Color,
  Group,
  Mesh,
  RepeatWrapping,
  ShaderMaterial,
  SphereGeometry,
  TextureLoader,
} from "three";
import type { BlackHoleProfile } from "../black-holes.ts";
import type { Observation, Observatory } from "./observatory.ts";
import fragmentShader from "./accretion.frag?raw";

export async function createBlackHoleWorld(
  host: Observatory,
  { blackHole, onFirstFrame }: { blackHole: BlackHoleProfile; onFirstFrame: () => void },
): Promise<Observation> {
  const map = await new TextureLoader().loadAsync("/textures/fields/accretion.png");
  map.wrapS = RepeatWrapping;
  const { diskHueDegrees, diskTiltDegrees, diskActivity, jetStrength, seed } = blackHole.visual;
  const root = new Group();
  const geometry = new SphereGeometry(12, 44, 30);
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    transparent: true,
    defines: { RAY_STEPS: host.profile.tier === "mobile" ? 80 : 120 },
    uniforms: {
      diskMap: { value: map },
      diskTint: { value: new Color().setHSL(diskHueDegrees / 360, 0.93, 0.45) },
      jetTint: { value: new Color().setHSL((diskHueDegrees + 175) / 360, 0.71, 0.64) },
      jet: { value: jetStrength },
      activity: { value: diskActivity },
      seed: { value: seed / 4294967296 },
      elapsed: { value: 0 },
      companion: {
        value: blackHole.observation.companion
          ? blackHole.name === "Cygnus X-1"
            ? 0.87
            : 0.54
          : 0,
      },
    },
    vertexShader: `varying vec3 eye,entry;void main(){entry=position;eye=(inverse(modelViewMatrix)*vec4(0.,0.,0.,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader,
  });
  const lens = new Mesh(geometry, material);
  lens.rotation.set(0.21, 0, (diskTiltDegrees * Math.PI) / 180);
  root.add(lens);
  return {
    root,
    seed,
    onFirstFrame,
    distance: 29,
    nearDistance: 13,
    farDistance: 56,
    update(delta) {
      material.uniforms.elapsed!.value += delta;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      map.dispose();
      root.removeFromParent();
    },
  };
}
