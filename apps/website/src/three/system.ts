import type { ExoplanetProfile } from "@exora/contracts";
import { deriveHostStar, deriveWorldRecipe, hashObjectId } from "@exora/worldgen";
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Line,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";
import { skyViewpointFrom } from "../sky-catalog.ts";
import type { Vector3Value } from "../solar-ephemeris.ts";
import type { DerivedSolarPosition } from "../solar-orbits.ts";
import { tuneSolarWorldRecipe } from "../solar-system.ts";
import {
  deriveSystemLayout,
  hasEarthSightline,
  mapDistance,
  orbitRadiusAu,
  orbitStateAt,
} from "../system-layout.ts";
import type { Observatory } from "./observatory.ts";
import { disposeObjects, orbitGuide } from "./orbit-guides.ts";
import { loadPlanetFields } from "./planet-fields.ts";
import { createPlanetGlobe } from "./planet-globe.ts";

interface SystemOptions {
  planets: readonly ExoplanetProfile[];
  hostName: string;
  onFirstFrame: () => void;
  onSelectHostStar?: () => void;
  onSelectWorld?: (planet: ExoplanetProfile) => void;
  solarPositionsAt?: (date: Date) => DerivedSolarPosition[];
}
export type SystemWorld = Awaited<ReturnType<typeof createSystemWorld>>;

export async function createSystemWorld(host: Observatory, options: SystemOptions) {
  const { planets, hostName, solarPositionsAt, onFirstFrame } = options;
  const layout = deriveSystemLayout(planets),
    fields = await loadPlanetFields(planets.some((planet) => planet.kind === "rocky"));
  const root = new Group(),
    guides = new Group();
  root.add(guides);
  const outer = Math.max(
    layout.mapping.outerSceneUnits,
    ...layout.orbits.map((o) => o.semiMajorAxisSceneUnits),
  );
  const color = planets[0]
    ? new Color().setRGB(...deriveHostStar(planets[0]).color, SRGBColorSpace)
    : new Color(0xfff8d9);
  const star = new Mesh(
    new SphereGeometry(layout.hostRadiusSceneUnits, 48, 32),
    new MeshBasicMaterial({ color }),
  );
  star.userData.select = options.onSelectHostStar;
  guides.add(star);
  const steps = host.profile.systemOrbitSegments;
  const zone = layout.habitableZone;
  if (zone) {
    const limits = [
      zone.optimisticInnerAu,
      zone.conservativeInnerAu,
      zone.conservativeOuterAu,
      zone.optimisticOuterAu,
    ].map((au) => Math.min(outer * 2.9, mapDistance(layout.mapping, au)));
    for (let i = 1; i < limits.length; i++) {
      if (limits[i]! <= limits[i - 1]!) continue;
      const band = new Mesh(
        new RingGeometry(limits[i - 1]!, limits[i]!, steps),
        new MeshBasicMaterial({
          color: 0x54b68f,
          transparent: true,
          opacity: i === 2 ? 0.135 : 0.05,
          side: DoubleSide,
          depthWrite: false,
        }),
      );
      band.rotation.x = -Math.PI / 2;
      band.position.y = -0.015;
      band.raycast = () => {};
      guides.add(band);
    }
  }
  if (hasEarthSightline(layout)) {
    const reach = 1.3 * outer;
    const line = new Line(
      new BufferGeometry().setFromPoints([new Vector3(0, 0, -reach), new Vector3(0, 0, reach)]),
      new LineDashedMaterial({
        color: 0x81b5c1,
        dashSize: reach / 48,
        gapSize: reach / 65,
        transparent: true,
        opacity: 0.46,
      }),
    );
    line.computeLineDistances();
    line.raycast = () => {};
    guides.add(line);
  }
  const listeners = new Set<(index: number) => void>();
  const bodies = layout.orbits.map((orbit) => {
    const plane = new Group(),
      track = orbitGuide(
        (a) =>
          mapDistance(
            layout.mapping,
            orbitRadiusAu(orbit.elements.semiMajorAxisAu, orbit.elements.eccentricity, a),
          ),
        0x869caf,
        steps,
        0.56,
      );
    track.rotation.x = orbit.tiltRadians;
    guides.add(track);
    root.add(plane);
    const recipe = tuneSolarWorldRecipe(orbit.planet, deriveWorldRecipe(orbit.planet));
    const globe = createPlanetGlobe(
      recipe,
      fields.surface,
      fields.flow,
      host.profile.systemBodySegments,
      { identity: orbit.planet.solarSystem },
    );
    globe.root.scale.setScalar(orbit.bodyRadiusSceneUnits / recipe.radiusSceneUnits);
    globe.root.traverse((item) => {
      item.userData.select = () => options.onSelectWorld?.(orbit.planet);
    });
    plane.add(globe.root);
    return { orbit, plane, globe, previous: null as number | null };
  });
  let elapsed = 0,
    seconds = 0,
    rate = 1,
    ephemeris = false;
  let positions = new Map<number, Vector3Value>();
  const lightDirection = new Vector3();
  function place() {
    for (const [index, body] of bodies.entries()) {
      const { orbit, plane, globe } = body;
      const position = ephemeris ? positions.get(orbit.planet.solarSystem?.naifId ?? -1) : null;
      const length = position ? Math.hypot(position.x, position.y, position.z) : 0;
      if (position && length > 0) {
        plane.rotation.x = 0;
        globe.root.position
          .set(position.x, position.z, -position.y)
          .multiplyScalar(mapDistance(layout.mapping, length) / length);
      } else {
        const state = orbitStateAt(orbit, seconds, layout.daysPerSecond),
          radius = mapDistance(layout.mapping, state.radiusAu);
        const angle = state.trueAnomaly;
        plane.rotation.x = orbit.tiltRadians;
        globe.root.position.set(radius * Math.cos(angle), 0, -radius * Math.sin(angle));
        const offset = Math.atan2(Math.sin(angle + Math.PI / 2), Math.cos(angle + Math.PI / 2));
        if (
          !ephemeris &&
          body.previous !== null &&
          Math.abs(offset - body.previous) < Math.PI &&
          Math.sign(offset) !== Math.sign(body.previous)
        ) {
          for (const listener of listeners) listener(index);
        }
        body.previous = offset;
      }
      lightDirection
        .copy(globe.root.position)
        .applyQuaternion(plane.quaternion)
        .negate()
        .normalize();
      globe.setLightDirection(lightDirection);
      globe.update(elapsed);
    }
  }
  place();
  return {
    root,
    layout,
    seed: hashObjectId(hostName),
    skyViewpoint: planets[0] ? skyViewpointFrom(planets[0].observation) : null,
    nearDistance: 3.5,
    farDistance: outer * 4.5,
    distance: outer * 2.8,
    onFirstFrame,
    orbitDays: () => seconds * layout.daysPerSecond,
    setClockRate(value: number) {
      rate = Number.isFinite(value) ? value : 1;
    },
    onSightlineCrossing(listener: (index: number) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setEphemeris(value: boolean) {
      ephemeris = value;
      for (const body of bodies) body.previous = null;
      place();
    },
    setEphemerisTime(epoch: Date) {
      positions = new Map(
        (solarPositionsAt?.(epoch) ?? []).map((row) => [row.naifId, row.positionAu]),
      );
      if (ephemeris) place();
    },
    update(delta: number) {
      elapsed += delta;
      seconds += delta * rate;
      place();
    },
    pick(object: import("three").Object3D) {
      (object.userData.select as (() => void) | undefined)?.();
    },
    dispose() {
      listeners.clear();
      for (const body of bodies) body.globe.dispose();
      disposeObjects(guides);
      fields.dispose();
      root.removeFromParent();
    },
  };
}
