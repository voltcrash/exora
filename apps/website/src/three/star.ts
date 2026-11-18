import type { StarProfile } from "@exora/contracts";
import { deriveStarRecipe } from "@exora/worldgen";
import {
  AdditiveBlending,
  BackSide,
  Color,
  Group,
  Mesh,
  RepeatWrapping,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
} from "three";
import type { Observation, Observatory } from "./observatory.ts";
import { skyViewpointFrom } from "../sky-catalog.ts";
import { createProminences } from "./prominences.ts";
import vertexShader from "./globe.vert?raw";

export async function createStarWorld(
  host: Observatory,
  { star, onFirstFrame }: { star: StarProfile; onFirstFrame: () => void },
): Promise<Observation> {
  const recipe = deriveStarRecipe(star);
  const data = await new TextureLoader().loadAsync("/textures/fields/photosphere.png");
  data.wrapS = RepeatWrapping;
  const root = new Group(),
    radius = recipe.radiusSceneUnits * 0.5;
  const geometry = new SphereGeometry(
    radius,
    host.profile.planetSegments,
    Math.ceil(host.profile.planetSegments * 0.5),
  );
  const uniforms = {
    tint: { value: new Color().setRGB(...recipe.color, SRGBColorSpace) },
    fieldMap: { value: data },
    seed: { value: recipe.seed / 4294967296 },
    clock: { value: 0 },
    spots: { value: recipe.spotCoverage },
    activity: { value: recipe.activity },
  };
  const material = new ShaderMaterial({
    vertexShader,
    uniforms,
    fragmentShader: `
    uniform sampler2D fieldMap;uniform vec3 tint;uniform float seed,clock,spots,activity;
    varying vec3 vLocal;varying vec3 vNormal;varying vec3 vEye;
    void main(){
      vec3 p=normalize(vLocal);vec2 uv=vec2(atan(p.z,p.x)/6.2831853+.5+seed,asin(clamp(p.y,-1.,1.))/3.14159265+.5);
      uv.x+=.002*sin(uv.y*32.+clock*.09);
      vec2 dx=dFdx(uv),dy=dFdy(uv);dx.x-=floor(dx.x+.5);dy.x-=floor(dy.x+.5);
      vec3 field=textureGrad(fieldMap,uv,dx,dy).rgb;
      float limb=.33+.67*sqrt(max(0.,dot(normalize(vNormal),normalize(vEye))));
      float spot=1.-smoothstep(.25,.32+spots*.35,field.g);
      vec3 light=tint*(.80+.50*field.r+.19*field.b)*limb;
      light=mix(light,light*vec3(.31,.17,.09),min(1.,spot*spots*4.));
      gl_FragColor=vec4(light,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  });
  const starMesh = new Mesh(geometry, material);
  const loops = createProminences(radius, uniforms.tint.value, recipe.activity, recipe.seed);
  starMesh.add(loops);
  const haloMaterial = new ShaderMaterial({
    vertexShader,
    uniforms,
    side: BackSide,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    fragmentShader: `uniform vec3 tint;uniform float activity,clock;varying vec3 vNormal;varying vec3 vEye;varying vec3 vLocal;
    void main(){float depth=max(0.,-dot(normalize(vNormal),normalize(vEye)));
      float stream=.79+.21*sin(vLocal.x*38.+vLocal.y*24.+clock*.09);
      gl_FragColor=vec4(tint,pow(depth,4.)*stream*(.92+activity*.75));
      #include <colorspace_fragment>
    }`,
  });
  const halo = new Mesh(geometry, haloMaterial);
  halo.scale.setScalar(1.32);
  root.add(starMesh, halo);
  return {
    root,
    distance: radius * 3.85,
    nearDistance: radius * 1.25,
    farDistance: radius * 8,
    skyViewpoint: skyViewpointFrom(star.observation),
    seed: recipe.seed,
    onFirstFrame,
    update(delta) {
      uniforms.clock.value += delta;
      starMesh.rotation.y += delta * (0.007 + recipe.rotationFactor * 0.035);
    },
    dispose() {
      root.removeFromParent();
      geometry.dispose();
      material.dispose();
      haloMaterial.dispose();
      loops.geometry.dispose();
      loops.material.dispose();
      data.dispose();
    },
  };
}
