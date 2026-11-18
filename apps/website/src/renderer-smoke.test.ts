import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import { deriveWorldRecipe } from "@exora/worldgen";
import {
  BackSide,
  Group,
  Mesh,
  PerspectiveCamera,
  Points,
  ShaderMaterial,
  Texture,
  TextureLoader,
  Vector3,
} from "three";
import { BLACK_HOLES } from "./black-holes.ts";
import { findPlanetarySubsystem } from "./planetary-subsystems.ts";
import { deriveRenderQuality } from "./render-quality.ts";
import { findSolarRegion } from "./solar-regions.ts";
import {
  EARTH,
  HAUMEA,
  JUPITER,
  MARS,
  NEPTUNE,
  SATURN,
  SOLAR_SYSTEM_PLANETS,
  SUN,
  tuneSolarWorldRecipe,
} from "./solar-system.ts";
import { solarPositionsAt } from "./solar-orbits.ts";
import { createBlackHoleWorld } from "./three/black-hole.ts";
import type { Observatory } from "./three/observatory.ts";
import { createPlanetWorld } from "./three/planet.ts";
import { createSolarRegionWorld } from "./three/region.ts";
import { createStarWorld } from "./three/star.ts";
import { createSubsystemWorld } from "./three/subsystem.ts";
import { createSystemWorld } from "./three/system.ts";

const profile = deriveRenderQuality({ pixelRatio: 1, userAgent: "Mobile" });
const camera = new PerspectiveCamera();
const host = { profile, qualityTier: profile.tier, camera } as Observatory;
const onFirstFrame = () => {};
beforeEach(() => {
  vi.spyOn(TextureLoader.prototype, "loadAsync").mockImplementation(
    async () => new Texture<HTMLImageElement>(),
  );
});
afterEach(() => vi.restoreAllMocks());

test.each([MARS, JUPITER, NEPTUNE, SATURN, HAUMEA])(
  "$name uses its recipe, smooth normals, measured shape and owned material",
  async (planet) => {
    const recipe = tuneSolarWorldRecipe(planet, deriveWorldRecipe(planet));
    const onSelectHostStar = vi.fn();
    const world = await createPlanetWorld(host, {
      planet,
      recipe,
      onViewModeChange: vi.fn(),
      onSelectHostStar,
      onFirstFrame,
    });
    const [sun, globe] = world.root.children[0]!.children;
    const body = globe!.children[0] as Mesh;
    expect(body.geometry.getAttribute("normal").count).toBe(
      body.geometry.getAttribute("position").count,
    );
    expect((body.material as ShaderMaterial).uniforms.seed!.value).toBe(recipe.seed / 4294967296);
    if (planet === SATURN) expect(globe!.children).toHaveLength(2);
    if (planet === HAUMEA) {
      expect(body.scale.x / body.scale.y).toBeCloseTo(2322 / 1026);
      expect((body.material as ShaderMaterial).uniforms.unresolved!.value).toBe(true);
    }
    world.pick!(sun!);
    expect(onSelectHostStar).toHaveBeenCalledOnce();
    const geometry = vi.spyOn(body.geometry, "dispose");
    const previous = body.rotation.y;
    world.update!(0.05, camera, 0.05);
    expect(body.rotation.y).not.toBe(previous);
    world.dispose();
    expect(geometry).toHaveBeenCalledOnce();
  },
);

test("a planet abandoned during its field loads releases both textures", async () => {
  const textures = [new Texture<HTMLImageElement>(), new Texture<HTMLImageElement>()];
  const dispose = textures.map((t) => vi.spyOn(t, "dispose"));
  const loader = vi.spyOn(TextureLoader.prototype, "loadAsync");
  for (const texture of textures) loader.mockResolvedValueOnce(texture);
  const cancel = new AbortController();
  const build = createPlanetWorld(host, {
    planet: MARS,
    recipe: deriveWorldRecipe(MARS),
    signal: cancel.signal,
    onViewModeChange: vi.fn(),
    onFirstFrame,
  });
  cancel.abort();
  await expect(build).rejects.toMatchObject({ name: "AbortError" });
  expect(loader).toHaveBeenCalledTimes(2);
  dispose.forEach((fn) => expect(fn).toHaveBeenCalledOnce());
});

test("the photosphere and inward-facing corona share geometry and release it once", async () => {
  const world = await createStarWorld(host, { star: SUN, onFirstFrame });
  const [star, halo] = world.root.children as Mesh[];
  expect(star!.geometry).toBe(halo!.geometry);
  expect((halo!.material as ShaderMaterial).side).toBe(BackSide);
  expect(star!.children).toHaveLength(1);
  const owned = vi.spyOn(star!.geometry, "dispose");
  world.update!(1, camera, 1);
  expect(star!.rotation.y).toBeGreaterThan(0);
  world.dispose();
  expect(owned).toHaveBeenCalledOnce();
});

test.each(BLACK_HOLES)("the $name lens uses its disk and observed companion", async (blackHole) => {
  const world = await createBlackHoleWorld(host, { blackHole, onFirstFrame });
  const lens = world.root.children[0] as Mesh;
  const material = lens.material as ShaderMaterial;
  expect(material.uniforms.diskMap!.value).toBeInstanceOf(Texture);
  expect(material.uniforms.companion!.value > 0).toBe(Boolean(blackHole.observation.companion));
  expect(material.defines.RAY_STEPS).toBe(80);
  expect(world.nearDistance).toBeGreaterThan(12);
  const release = vi.spyOn(material, "dispose");
  world.update!(2, camera, 2);
  expect(material.uniforms.elapsed!.value).toBe(2);
  world.dispose();
  expect(release).toHaveBeenCalledOnce();
});

test("the heliosphere scales its statistical sample and releases the particle field", async () => {
  const region = findSolarRegion("Heliosphere")!;
  const world = await createSolarRegionWorld(host, { region, onFirstFrame });
  const field = world.root.children.find((object) => object instanceof Points)!;
  expect(field.geometry.getAttribute("position").count).toBe(region.sampleCount.mobile);
  const release = vi.spyOn(field.geometry, "dispose");
  world.dispose();
  expect(release).toHaveBeenCalledOnce();
});

test("subsystem tracks, selection and synchronous moons survive a change in orbital phase", async () => {
  const subsystem = findPlanetarySubsystem("Jupiter")!;
  const onSelectMoon = vi.fn();
  const world = await createSubsystemWorld(host, {
    planet: JUPITER,
    subsystem,
    onFirstFrame,
    onSelectMoon,
  });
  for (const moon of subsystem.moons)
    expect(world.root.getObjectByName(moon.name + " orbit")).toBeDefined();
  const moon = world.root.getObjectByName("Io")!;
  world.pick!(moon);
  expect(onSelectMoon).toHaveBeenCalledWith("Io");
  const pivot = moon.parent!;
  const before = pivot.position.clone();
  world.update!(3, camera, 3);
  expect(pivot.position.length()).toBeCloseTo(before.length());
  expect(pivot.rotation.y).toBeCloseTo(
    Math.atan2(-pivot.position.z, pivot.position.x) +
      2 * Math.PI * Math.round(pivot.rotation.y / (2 * Math.PI)),
  );
  world.dispose();
});

test("system worlds follow their orbits, accept ephemeris dates, and dispatch both pick targets", async () => {
  const onSelectWorld = vi.fn(),
    onSelectHostStar = vi.fn();
  const world = await createSystemWorld(host, {
    planets: SOLAR_SYSTEM_PLANETS,
    hostName: "Sun",
    onFirstFrame,
    onSelectWorld,
    onSelectHostStar,
    solarPositionsAt,
  });
  const [guides, ...planes] = world.root.children as Group[];
  expect(planes).toHaveLength(SOLAR_SYSTEM_PLANETS.length);
  const earthIndex = world.layout.orbits.findIndex((orbit) => orbit.planet === EARTH);
  const earth = planes[earthIndex]!.children[0]!;
  const mesh = earth.children[0] as Mesh;
  expect(mesh.geometry.getAttribute("position").count).toBeLessThan(
    profile.planetSegments ** 2 / 2,
  );
  world.pick(mesh);
  world.pick(guides!.children[0]!);
  expect(onSelectWorld).toHaveBeenCalledWith(EARTH);
  expect(onSelectHostStar).toHaveBeenCalledOnce();
  const initial = earth.position.clone();
  world.setClockRate(2);
  world.update(2);
  expect(earth.position.distanceTo(initial)).toBeGreaterThan(0);
  const animated = earth.position.clone();
  const epoch = new Date("2026-08-23T00:00:00Z");
  world.setEphemerisTime(epoch);
  world.setEphemeris(true);
  const row = solarPositionsAt(epoch).find((r) => r.naifId === 399)!.positionAu;
  expect(
    earth.position
      .clone()
      .normalize()
      .distanceTo(new Vector3(row.x, row.z, -row.y).normalize()),
  ).toBeLessThan(0.00001);
  world.setEphemeris(false);
  expect(earth.position.distanceTo(animated)).toBeLessThan(0.00001);
  const release = vi.spyOn(mesh.geometry, "dispose");
  world.dispose();
  expect(release).toHaveBeenCalledOnce();
});
