import type { ExoplanetProfile } from "@exora/contracts";
import { deriveTidalLocking, type WorldRecipe } from "@exora/worldgen";
import {
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from "three";
import { easeAway, SURFACE_SWAP_AT, SURFACE_TRANSITION_MS } from "../travel-transition.ts";
import { skyViewpointFrom } from "../sky-catalog.ts";
import { createPlanetGlobe } from "./planet-globe.ts";
import { loadTerrainScans } from "./terrain-scans.ts";
import { loadPlanetFields } from "./planet-fields.ts";
import { createLandscape, siteSun, type LandscapeTerrain } from "./landscape.ts";
import { cloudDeckGeology, deriveSurfaceGeology } from "../surface-geology.ts";
import { SURFACE_EYE_HEIGHT, SURFACE_WALK_LIMIT } from "../surface-landing.ts";
import { SURFACE_GRID_RESOLUTION } from "../surface-vista-baking.ts";
import { runTerrainJob } from "../terrain-worker-client.ts";
import type { Observatory, Observation } from "./observatory.ts";

export type ViewMode = "orbit" | "surface" | "transition" | "subsystem";
interface PlanetOptions {
  planet: ExoplanetProfile;
  recipe: WorldRecipe;
  signal?: AbortSignal;
  onViewModeChange: (mode: ViewMode) => void;
  onSelectHostStar?: () => void;
  onFirstFrame(): void;
}

export async function createPlanetWorld(
  host: Observatory,
  options: PlanetOptions,
): Promise<Observation> {
  const { planet, recipe, onViewModeChange, signal } = options;
  const fields = await loadPlanetFields(recipe.renderer === "rocky", [planet]);
  if (signal?.aborted) {
    fields.dispose();
    signal.throwIfAborted();
  }
  const { camera, controls, canvas } = host;
  const globe = createPlanetGlobe(
    recipe,
    fields.surface,
    fields.flow,
    host.profile.planetSegments,
    {
      identity: planet.solarSystem,
      model: fields.models.get(planet.name.toLowerCase()),
    },
  );
  const hours =
    planet.solarSystem?.rotationPeriodHours ??
    (planet.source.table === "procedural"
      ? null
      : (deriveTidalLocking(planet)?.rotationPeriodDays ?? 0) * 24);
  const spin = hours
    ? Math.sign(hours) * Math.min(0.22, Math.max(0.008, 0.085 * (24 / Math.abs(hours)) ** 0.32))
    : recipe.rotationSpeed;
  const root = new Group(),
    space = new Group();
  const radius = recipe.radiusSceneUnits;
  const distance = Math.max(3.6 * radius, globe.extent * 3.2);
  const neutralSurface =
    planet.solarSystem?.surfaceStatus === "unresolved" ||
    planet.solarSystem?.surfaceStatus === "modeled";
  const nearDistance = (neutralSurface ? globe.extent : radius) * 1.28;
  const terrainPrepareDistance = distance * 0.96;
  const descentDistance = distance * 0.76;
  const sun = new Mesh(
    new SphereGeometry(Math.max(0.4, recipe.star.radiusSceneUnits * 0.6), 28, 20),
    new MeshBasicMaterial({ color: new Color().setRGB(...recipe.star.color, SRGBColorSpace) }),
  );
  sun.position
    .set(-0.72, 0.39, 0.58)
    .normalize()
    .multiplyScalar(37 * radius);
  space.add(sun, globe.root);
  root.add(space);
  let surface: ReturnType<typeof createLandscape> | null = null;
  const surfaceAbort = new AbortController();
  let surfaceTerrain: LandscapeTerrain | null = null;
  let scans: Awaited<ReturnType<typeof loadTerrainScans>> = null;
  let terrainStarted = false;
  let terrainError: Error | undefined;

  function prepareTerrain() {
    terrainStarted = true;
    const identity = planet.solarSystem ? { naifId: planet.solarSystem.naifId } : null;
    const geology = deriveSurfaceGeology(recipe, identity) ?? cloudDeckGeology(recipe);
    if (!geology) return;
    const signal = surfaceAbort.signal;
    if (geology.medium === "rock") {
      const anisotropy = Math.min(
        host.profile.anisotropicFiltering,
        host.renderer.capabilities.getMaxAnisotropy(),
      );
      void loadTerrainScans(geology, anisotropy).then((loaded) => {
        if (signal.aborted) loaded?.dispose();
        else if (loaded) {
          scans = loaded;
          surface?.setScans(loaded.ground, loaded.cliff);
        }
      });
    }
    void runTerrainJob(
      {
        kind: "surface",
        input: {
          geology,
          resolution: SURFACE_GRID_RESOLUTION[host.profile.tier],
          sunDirection: siteSun(recipe.seed),
        },
      },
      signal,
    )
      .then((result) => {
        if (result?.kind === "surface") surfaceTerrain = { geology, data: result.data };
      })
      .catch((cause: unknown) => {
        if (!signal.aborted)
          terrainError = new Error("Could not generate the landing terrain", { cause });
      });
  }
  let mode: "orbit" | "surface" = "orbit",
    attached = false,
    elapsed = 0;
  let transitionStart: number | null = null;
  let approachDistance = distance;
  const orbitDirection = new Vector3();
  const walk = new Vector3(),
    direction = new Vector3(),
    mouse = new Vector2();
  const keys = new Set<string>(),
    fingers = new Map<number, Vector2>();
  const touchStart = new Vector2();
  let walkAfter = Infinity;
  let yaw = 0,
    pitch = 0,
    pinch = 0;
  function look() {
    walk.y = surface!.floorAt(walk.x, walk.z) + SURFACE_EYE_HEIGHT;
    camera.position.copy(walk);
    surface!.follow(walk.x, walk.z);
    direction.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    );
    controls.target.copy(walk).add(direction);
    camera.lookAt(controls.target);
  }
  let previousShadows = false;
  function land() {
    if (!surface) {
      surface = createLandscape(
        recipe,
        fields.surface,
        surfaceTerrain,
        host.profile.tier === "mobile",
        fields.flow,
        planet,
        fields.models.get(planet.solarSystem?.parent?.toLowerCase() ?? ""),
      );
      if (scans) surface.setScans(scans.ground, scans.cliff);
      root.add(surface.root);
    }
    previousShadows = host.renderer.shadowMap.enabled;
    host.renderer.shadowMap.enabled = !!surfaceTerrain && surfaceTerrain.geology.medium === "rock";
    mode = "surface";
    space.visible = false;
    surface.root.visible = true;
    controls.enableRotate = controls.enableZoom = false;
    controls.enableDamping = false;
    controls.minDistance = 0.2;
    controls.maxDistance = 100;
    const landing = surface.landing;
    walk.set(landing.x, 0, landing.z);
    yaw = landing.yaw;
    pitch = 0.055;
    look();
    onViewModeChange("surface");
  }
  function orbit() {
    if (mode === "surface") host.renderer.shadowMap.enabled = previousShadows;
    mode = "orbit";
    space.visible = true;
    if (surface) surface.root.visible = false;
    controls.enableRotate = controls.enableZoom = controls.enableDamping = true;
    controls.minDistance = nearDistance;
    controls.maxDistance = distance * 3;
    camera.position.copy(orbitDirection).multiplyScalar(distance);
    controls.target.set(0, 0, 0);
    controls.update();
    keys.clear();
    fingers.clear();
    walkAfter = Infinity;
    pinch = 0;
    onViewModeChange("orbit");
  }
  function beginTransition() {
    if (transitionStart !== null) return;
    if (mode === "orbit") {
      approachDistance = controls.getDistance();
      orbitDirection.copy(camera.position).sub(controls.target).normalize();
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (mode === "orbit") land();
      else orbit();
      return;
    }
    controls.enableZoom = controls.enableRotate = false;
    transitionStart = performance.now();
    onViewModeChange("transition");
  }
  function wheel(e: WheelEvent) {
    if (host.isInXr() || mode !== "surface") return;
    if (e.deltaY > 0) {
      e.preventDefault();
      beginTransition();
    }
  }
  const typing = (e: KeyboardEvent) =>
    e.target instanceof Element &&
    Boolean(e.target.closest("input,textarea,select,[contenteditable=true]"));
  const press = (e: KeyboardEvent) => {
    if (!typing(e) && mode === "surface" && !host.isInXr() && /^Key[WASD]$/.test(e.code))
      keys.add(e.code);
  };
  const release = (e: KeyboardEvent) => {
    keys.delete(e.code);
  };
  const blur = () => {
    keys.clear();
    fingers.clear();
    walkAfter = Infinity;
    pinch = 0;
  };
  const down = (e: PointerEvent) => {
    if (mode !== "surface" || host.isInXr()) return;
    mouse.set(e.clientX, e.clientY);
    fingers.set(e.pointerId, new Vector2(e.clientX, e.clientY));
    touchStart.copy(mouse);
    walkAfter =
      e.pointerType === "touch" && fingers.size === 1 ? performance.now() + 340 : Infinity;
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!fingers.has(e.pointerId) || mode !== "surface") return;
    const point = fingers.get(e.pointerId)!.set(e.clientX, e.clientY);
    if (performance.now() < walkAfter && point.distanceToSquared(touchStart) > 64)
      walkAfter = Infinity;
    if (fingers.size === 2) {
      const [a, b] = fingers.values();
      const span = a!.distanceTo(b!);
      if (pinch && span < pinch * 0.85) beginTransition();
      else if (!pinch) pinch = span;
      return;
    }
    yaw -= (e.clientX - mouse.x) * 0.004;
    pitch = Math.max(-1.35, Math.min(1.35, pitch - (e.clientY - mouse.y) * 0.004));
    mouse.set(e.clientX, e.clientY);
    look();
  };
  const up = (e: PointerEvent) => {
    fingers.delete(e.pointerId);
    walkAfter = Infinity;
    pinch = 0;
    for (const point of fingers.values()) mouse.copy(point);
  };
  const listeners = new AbortController();
  return {
    root,
    distance,
    nearDistance,
    farDistance: distance * 3,
    seed: recipe.seed,
    skyViewpoint: skyViewpointFrom(planet.observation),
    onFirstFrame() {
      attached = true;
      const events = { signal: listeners.signal };
      canvas.addEventListener("wheel", wheel, { ...events, passive: false });
      canvas.addEventListener("webglcontextrestored", () => surface?.updateShadows(), events);
      canvas.addEventListener("pointerdown", down, events);
      canvas.addEventListener("pointermove", move, events);
      canvas.addEventListener("pointerup", up, events);
      canvas.addEventListener("pointercancel", up, events);
      window.addEventListener("keydown", press, events);
      window.addEventListener("keyup", release, events);
      window.addEventListener("blur", blur, events);
      options.onFirstFrame();
    },
    update(delta, _camera, inputDelta = delta) {
      elapsed += delta;
      globe.update(elapsed, spin);
      if (!attached) return;
      if (host.isInXr()) {
        if (mode === "surface" || transitionStart !== null) {
          transitionStart = null;
          orbit();
        }
        return;
      }
      if (transitionStart !== null) {
        const progress =
          (performance.now() - transitionStart) / (SURFACE_TRANSITION_MS * SURFACE_SWAP_AT);
        if (progress < 1) {
          if (mode === "orbit") {
            const radius =
              approachDistance + (nearDistance - approachDistance) * easeAway(progress);
            camera.position.copy(controls.target).addScaledVector(orbitDirection, radius);
          }
          return;
        }
        transitionStart = null;
        if (mode === "orbit") land();
        else orbit();
      }
      if (mode === "orbit") {
        const approach = controls.getDistance();
        if (!neutralSurface && !terrainStarted && approach <= terrainPrepareDistance)
          prepareTerrain();
        if (approach <= descentDistance) {
          if (terrainError) throw terrainError;
          if (neutralSurface || surfaceTerrain) beginTransition();
        }
      }
      if (mode === "surface") {
        surface?.update(delta);
        const forward =
            Number(keys.has("KeyW") || performance.now() >= walkAfter) - Number(keys.has("KeyS")),
          right = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
        const step = (inputDelta * 4.1) / Math.max(1, Math.hypot(forward, right));
        const nextX = Math.max(
          -SURFACE_WALK_LIMIT,
          Math.min(
            SURFACE_WALK_LIMIT,
            walk.x + step * (Math.sin(yaw) * forward + Math.cos(yaw) * right),
          ),
        );
        const nextZ = Math.max(
          -SURFACE_WALK_LIMIT,
          Math.min(
            SURFACE_WALK_LIMIT,
            walk.z + step * (-Math.cos(yaw) * forward + Math.sin(yaw) * right),
          ),
        );
        if (!surface?.blocks?.(walk.x, walk.z, nextX, nextZ, walk.y)) {
          walk.x = nextX;
          walk.z = nextZ;
        }
        look();
      }
    },
    pick(object) {
      if (object === (mode === "surface" ? surface?.star : sun)) options.onSelectHostStar?.();
    },
    dispose() {
      listeners.abort();
      surfaceAbort.abort();
      if (attached && (mode === "surface" || transitionStart !== null))
        controls.enableRotate = controls.enableZoom = controls.enableDamping = true;
      if (mode === "surface") host.renderer.shadowMap.enabled = previousShadows;
      surface?.dispose();
      scans?.dispose();
      globe.dispose();
      fields.dispose();
      sun.geometry.dispose();
      sun.material.dispose();
      root.removeFromParent();
    },
  };
}
