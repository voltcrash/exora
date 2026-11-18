import type { ExoplanetProfile } from "@exora/contracts";
import { deriveWorldRecipe } from "@exora/worldgen";
import {
  BufferGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  type Object3D,
} from "three";
import { subsystemOrbitRadius, type PlanetarySubsystem } from "../planetary-subsystems.ts";
import { findSolarWorld, tuneSolarWorldRecipe } from "../solar-system.ts";
import type { Observation, Observatory } from "./observatory.ts";
import { disposeObjects, orbitGuide } from "./orbit-guides.ts";
import { loadPlanetFields } from "./planet-fields.ts";
import { createPlanetGlobe } from "./planet-globe.ts";

interface SubsystemOptions {
  planet: ExoplanetProfile;
  subsystem: PlanetarySubsystem;
  onFirstFrame: () => void;
  onSelectMoon: (name: string) => void;
}
export async function createSubsystemWorld(
  host: Observatory,
  { planet, subsystem, onFirstFrame, onSelectMoon }: SubsystemOptions,
): Promise<Observation> {
  const fields = await loadPlanetFields();
  const root = new Group(),
    equator = new Group();
  const segments = host.profile.systemOrbitSegments,
    primaryRadius = 1.55;
  const toRadius = (distance: number) => subsystemOrbitRadius(subsystem, distance);
  equator.rotation.z = ((planet.solarSystem?.axialTiltDegrees ?? 0) * Math.PI) / 180;
  root.add(equator);
  const parentRecipe = tuneSolarWorldRecipe(planet, deriveWorldRecipe(planet));
  const primary = createPlanetGlobe(
    { ...parentRecipe, axialTilt: 0 },
    fields.strata,
    fields.flow,
    segments / 2,
    { drawRings: false, identity: planet.solarSystem },
  );
  primary.root.scale.setScalar(primaryRadius / parentRecipe.radiusSceneUnits);
  equator.add(primary.root);
  const light = new DirectionalLight(0xfff1d9, 2);
  light.position.set(-0.72, 0.39, 0.58);
  root.add(light, new HemisphereLight(0xb1c5d7, 0x202b31, 0.8));
  function layer(
    geometry: BufferGeometry,
    color: Color | number,
    opacity: number,
    parent: Object3D = equator,
  ) {
    const mesh = new Mesh(
      geometry,
      new MeshBasicMaterial({
        color,
        transparent: opacity < 1,
        opacity,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    mesh.raycast = () => {};
    parent.add(mesh);
    return mesh;
  }
  for (const ring of subsystem.rings) {
    const inner = toRadius(ring.innerRadiusKilometers),
      outer = Math.max(inner + 0.01, toRadius(ring.outerRadiusKilometers));
    const mesh = layer(
      new RingGeometry(inner, outer, segments),
      new Color().setRGB(...ring.color, SRGBColorSpace),
      ring.opacity,
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.name = ring.name;
  }
  const resonant = new Set(subsystem.resonances.flatMap((r) => r.bodies));
  const moons = subsystem.moons.map((moon) => {
    const plane = new Group(),
      pivot = new Group();
    equator.add(plane);
    plane.add(pivot);
    plane.rotation.z = (moon.inclinationDegrees * Math.PI) / 180;
    const radius = toRadius(moon.orbitalSemiMajorAxisKilometers),
      size = 0.085 + Math.log10(1 + moon.meanRadiusKilometers) * 0.115;
    const guide = orbitGuide(
      () => radius,
      moon.retrograde ? 0xd98e96 : resonant.has(moon.name) ? 0xe9c78a : 0x7899ad,
      segments,
      0.4,
    );
    guide.name = moon.name + " orbit";
    plane.add(guide);
    const known = moon.surface === "mapped" ? findSolarWorld(moon.name) : null;
    const recipe = known ? tuneSolarWorldRecipe(known, deriveWorldRecipe(known)) : null;
    const globe = recipe
      ? createPlanetGlobe(recipe, fields.strata, fields.flow, host.profile.systemBodySegments, {
          drawRings: false,
          identity: known?.solarSystem,
        })
      : null;
    const body =
      globe?.root ??
      new Mesh(
        new SphereGeometry(1, 18, 14),
        new MeshStandardMaterial({ color: 0x838784, roughness: 0.98 }),
      );
    body.scale.setScalar(size / (recipe?.radiusSceneUnits ?? 1));
    body.name = moon.name;
    body.traverse((child) => {
      child.userData.moon = moon.name;
    });
    pivot.add(body);
    const plume = subsystem.plumes.find((p) => p.moon === moon.name);
    if (plume) {
      const height = Math.min(1, Math.max(0.23, plume.heightKilometers / 450));
      const particles = layer(
        new ConeGeometry(0.1, height, 12),
        0xaeddfa,
        plume.evidence === "confirmed" ? 0.58 : 0.26,
        pivot,
      );
      particles.position.y = -size - height * 0.38;
    }
    return { moon, globe, pivot, radius, phase: moon.naifId * 2.399963 };
  });
  if (subsystem.aurora) {
    const lat = (subsystem.aurora.latitudeDegrees * Math.PI) / 180;
    for (const sign of [-1, 1]) {
      const oval = layer(
        new TorusGeometry(Math.cos(lat) * primaryRadius * 1.04, 0.022, 8, segments),
        0x68efac,
        0.71,
      );
      oval.rotation.x = Math.PI / 2;
      oval.position.y = sign * Math.sin(lat) * primaryRadius;
    }
  }
  if (subsystem.torus) {
    const plasma = layer(
      new TorusGeometry(toRadius(subsystem.torus.radiusKilometers), 0.18, 12, segments),
      0xf493bb,
      0.16,
    );
    plasma.rotation.x = Math.PI / 2;
  }
  if (subsystem.magnetosphere) {
    const field = subsystem.magnetosphere;
    const day = 2.4 + Math.log10(1 + field.daysideRadiusInPrimaryRadii) * 2.1;
    const tail = day + 2 * Math.log10(1 + field.tailRadiusInPrimaryRadii);
    const shell = layer(new SphereGeometry(1, 44, 24), 0x699fc6, 0.045, root);
    shell.scale.set((day + tail) / 2, day * 0.7, day * 0.8);
    shell.position.x = (tail - day) / 2;
    shell.rotation.z = (field.axisTiltDegrees * Math.PI) / 180;
  }
  const markers = subsystem.lagrangePoints.map((point) => {
    const mesh = layer(new OctahedronGeometry(0.11), 0x95edbe, 0.88);
    mesh.name = point.label;
    return {
      mesh,
      moon: moons.find((m) => m.moon.name === point.reference),
      angle: (point.angleDegrees * Math.PI) / 180,
      radius: toRadius(point.radiusKilometers),
    };
  });
  const outer = Math.max(6, ...moons.map((m) => m.radius), ...markers.map((m) => m.radius));
  let elapsed = 0;
  function update(delta: number) {
    elapsed += delta;
    primary.update(elapsed);
    for (const m of moons) {
      const angle =
        m.phase +
        ((elapsed * 2 * Math.PI * 0.025) / Math.max(0.1, Math.abs(m.moon.orbitalPeriodDays))) *
          (m.moon.retrograde ? -1 : 1);
      m.pivot.position.set(m.radius * Math.cos(angle), 0, -m.radius * Math.sin(angle));
      m.globe?.update(elapsed, 0);
      m.pivot.rotation.y = angle;
    }
    for (const marker of markers) {
      const reference = marker.moon?.pivot.position;
      const angle = marker.angle + (reference ? Math.atan2(-reference.z, reference.x) : 0);
      marker.mesh.position.set(
        marker.radius * Math.cos(angle),
        0,
        -marker.radius * Math.sin(angle),
      );
      if (marker.moon) marker.mesh.position.applyQuaternion(marker.moon.pivot.parent!.quaternion);
    }
  }
  update(0);
  return {
    root,
    distance: outer * 2.8,
    nearDistance: 3,
    farDistance: outer * 5,
    seed: subsystem.parentNaifId,
    onFirstFrame,
    update,
    pick(object) {
      if (typeof object.userData.moon === "string") onSelectMoon(object.userData.moon);
    },
    dispose() {
      primary.dispose();
      for (const m of moons) m.globe?.dispose();
      disposeObjects(root);
      fields.dispose();
    },
  };
}
