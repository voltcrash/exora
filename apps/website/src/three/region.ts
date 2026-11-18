import {
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Points,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Material,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { sampleRegionParticles, type SolarRegionProfile } from "../solar-regions.ts";
import type { Observatory, Observation } from "./observatory.ts";

export async function createSolarRegionWorld(
  host: Observatory,
  { region, onFirstFrame }: { region: SolarRegionProfile; onFirstFrame: () => void },
): Promise<Observation> {
  const root = new Group();
  const particles = sampleRegionParticles(region, region.sampleCount[host.qualityTier]);
  const rock =
    region.evidence === "statistical-population" ||
    region.kind === "oort-shell" ||
    region.kind === "scattered-disk";
  const geometry = new BufferGeometry();
  const positions = new Float32Array(particles.length * 3);
  const colors = new Float32Array(positions.length);
  const tint = new Color(...region.color);
  particles.forEach((p, i) => {
    positions.set([p.x, p.y, p.z], i * 3);
    const energy = 0.45 + (Math.sin(i * 1.7) * 0.5 + 0.5) * 0.7;
    colors.set(
      [tint.r * energy, tint.g * energy, tint.b * energy * (p.cloud === "trailing" ? 1.7 : 1)],
      i * 3,
    );
  });
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  const grains = new Points(
    geometry,
    new ShaderMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexShader: `varying vec3 pigment; void main(){pigment=color;vec4 eye=modelViewMatrix*vec4(position,1.);
      gl_Position=projectionMatrix*eye; gl_PointSize=clamp(36./max(.1,-eye.z),1.35,4.0);}`,
      fragmentShader: `varying vec3 pigment; void main(){float falloff=1.-smoothstep(.08,.5,length(gl_PointCoord-.5));
      gl_FragColor=vec4(pigment,falloff*.76);
      #include <colorspace_fragment>
    }`,
    }),
  );
  root.add(
    grains,
    new Mesh(new SphereGeometry(0.19, 24, 16), new MeshBasicMaterial({ color: 0xffdb9b })),
  );
  const guides = region.kind === "belt" ? [4, 12] : region.kind === "trojan-clouds" ? [8] : [];
  for (const r of guides) {
    const vertices = Array.from(
      { length: 160 },
      (_, i) => new Vector3(r * Math.cos((i * Math.PI) / 80), 0, r * Math.sin((i * Math.PI) / 80)),
    );
    root.add(
      new LineLoop(
        new BufferGeometry().setFromPoints(vertices),
        new LineBasicMaterial({ color: tint, transparent: true, opacity: 0.22 }),
      ),
    );
  }
  for (const r of region.kind === "heliosphere"
    ? [7.2, 10.4]
    : region.evidence === "measured-boundary"
      ? [9.2]
      : []) {
    const shell = new Mesh(
      new SphereGeometry(r, 40, 24),
      new MeshBasicMaterial({
        color: tint,
        wireframe: true,
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
      }),
    );
    shell.scale.set(1.18, 0.8, 1);
    root.add(shell);
  }
  function dispose() {
    const geometries = new Set<BufferGeometry>(),
      materials = new Set<Material>();
    root.traverse((object) => {
      if (object instanceof Mesh || object instanceof Points || object instanceof LineLoop) {
        geometries.add(object.geometry);
        for (const item of [object.material].flat()) materials.add(item);
        if (object instanceof InstancedMesh) object.dispose();
      }
    });
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    root.removeFromParent();
  }
  if (rock) {
    const model =
      region.kind === "oort-shell"
        ? "comet-nucleus"
        : region.id.includes("kuiper") || region.kind === "scattered-disk"
          ? "ice-fragment"
          : "impact-fragment";
    try {
      const file = await new GLTFLoader().loadAsync(`/models/${model}.glb`);
      const mesh = file.scene.children[0];
      if (!(mesh instanceof Mesh)) throw Error("Missing small-body geometry");
      const count = host.qualityTier === "desktop" ? 60 : 20;
      const bodies = new InstancedMesh(mesh.geometry, mesh.material, count);
      const transform = new Object3D();
      for (let i = 0; i < count; i++) {
        const p = particles[Math.floor((i * particles.length) / count)]!;
        transform.position.set(p.x, p.y, p.z);
        transform.rotation.set(i * 0.82, i * 2.11, i * 0.19);
        transform.scale.setScalar(0.038 + (i % 7) * 0.009);
        transform.updateMatrix();
        bodies.setMatrixAt(i, transform.matrix);
      }
      const sunlight = new DirectionalLight(0xffe9d1, 2.7);
      sunlight.position.set(-4, 6, 3);
      root.add(bodies, sunlight, new AmbientLight(0xcad8ff, 0.65));
    } catch (error) {
      dispose();
      throw error;
    }
  }
  return { root, distance: 30, nearDistance: 3.2, farDistance: 54, onFirstFrame, dispose };
}
