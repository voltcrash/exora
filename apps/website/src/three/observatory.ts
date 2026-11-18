import {
  Group,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { adaptHardwareScaling, deriveRenderQuality } from "../render-quality.ts";
import {
  transitionRendererStatus,
  type RendererEvent,
  type RendererStatus,
} from "../renderer-recovery.ts";

import { createImmersive } from "./immersive.ts";
import { TRAVEL_REVEAL_MS, type TravelPhase } from "../travel-transition.ts";
export type Observatory = ReturnType<typeof createObservatory>;

import { createNightSky } from "./sky.ts";
import type { SkyViewpoint } from "../sky-catalog.ts";
export interface Observation {
  skyViewpoint?: SkyViewpoint | null;
  seed?: number;
  root: Group;
  distance: number;
  nearDistance: number;
  farDistance: number;
  onFirstFrame(): void;
  update?(delta: number, camera: PerspectiveCamera, inputDelta: number): void;
  pick?(object: Object3D): void;
  dispose(): void;
}

export function createObservatory(canvas: HTMLCanvasElement) {
  const profile = deriveRenderQuality({
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    pixelRatio: window.devicePixelRatio,
    ...("deviceMemory" in navigator && typeof navigator.deviceMemory === "number"
      ? { deviceMemory: navigator.deviceMemory }
      : {}),
  });
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x02040a, 1);
  let scaling = profile.hardwareScalingLevel;
  renderer.setPixelRatio(1 / scaling);
  const scene = new Scene();
  const world = new Group();
  scene.add(world);
  const camera = new PerspectiveCamera(42, 1, 0.02, 8000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  const ray = new Raycaster();
  const pointer = new Vector2();
  const down = new Vector2();
  const direction = new Vector3(0.12, 0.53, 1).normalize();
  const onDown = (e: PointerEvent) => down.set(e.clientX, e.clientY);
  const onUp = (e: PointerEvent) => {
    if (
      !active?.pick ||
      !e.isPrimary ||
      e.button !== 0 ||
      Math.hypot(down.x - e.clientX, down.y - e.clientY) > 5
    )
      return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((e.clientY - rect.top) / rect.height) * 2,
    );
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObject(active.root).find(({ object }) => {
      for (let item: Object3D | null = object; item; item = item.parent)
        if (!item.visible) return false;
      return true;
    });
    if (hit) active.pick(hit.object);
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);
  const resize = () => {
    if (renderer.xr.isPresenting) return;
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.fov =
      (2 * Math.atan(Math.tan((42 * Math.PI) / 360) / Math.min(camera.aspect, 1)) * 180) / Math.PI;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  let status: RendererStatus = "ready";
  const listeners = new Set<(status: RendererStatus) => void>();
  const notify = (event: RendererEvent) => {
    const next = transitionRendererStatus(status, event);
    if (next === status) return;
    status = next;
    for (const listener of listeners) listener(next);
  };
  let disposed = false,
    suspended = 0,
    version = 0,
    previous = 0,
    frames = 0,
    windowTime = 0,
    fps = 0;
  let sky: ReturnType<typeof createNightSky> | null = null;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let active: Observation | null = null;
  let firstFrame = false;
  const phaseListeners = new Set<(phase: TravelPhase) => void>();
  let phase: TravelPhase = "idle";
  let revealAt = 0;
  const setPhase = (next: TravelPhase) => {
    phase = next;
    for (const listener of phaseListeners) listener(next);
  };
  const desktopPosition = camera.position.clone();
  const desktopRotation = camera.quaternion.clone();
  const desktopTarget = controls.target.clone();
  const saveDesktopView = () => {
    desktopPosition.copy(camera.position);
    desktopRotation.copy(camera.quaternion);
    desktopTarget.copy(controls.target);
  };
  const restoreDesktopView = () => {
    camera.position.copy(desktopPosition);
    camera.quaternion.copy(desktopRotation);
    controls.target.copy(desktopTarget);
    controls.update();
    resize();
    sync();
  };
  renderer.xr.addEventListener("sessionstart", saveDesktopView);
  renderer.xr.addEventListener("sessionend", restoreDesktopView);
  const immersive = createImmersive(
    renderer,
    scene,
    world,
    () => active?.distance ?? 1,
    (enabled) => {
      controls.enabled = !enabled;
      if (sky) sky.mesh.visible = !enabled;
      if (enabled) sync();
    },
    (visible) => {
      if (sky) sky.mesh.visible = visible;
    },
  );
  function draw(now: number, frame?: XRFrame) {
    if (disposed || status === "context-lost" || status === "failed") return;
    const seconds = previous ? (now - previous) / 1000 : 0;
    previous = now;
    windowTime += seconds;
    frames++;
    if (windowTime >= 2) {
      fps = frames / windowTime;
      frames = 0;
      windowTime = 0;
      const next = adaptHardwareScaling(scaling, fps, profile, renderer.xr.isPresenting);
      if (next !== scaling) {
        scaling = next;
        renderer.setPixelRatio(1 / scaling);
        resize();
      }
    }
    try {
      immersive.frame(frame);
      if (!renderer.xr.isPresenting) controls.update();
      const delta = Math.min(0.05, seconds);
      active?.update?.(reduced.matches ? 0 : delta, camera, delta);
      renderer.render(scene, camera);
      notify("frame-rendered");
      if (firstFrame && active) {
        firstFrame = false;
        active.onFirstFrame();
        if (phase === "crossing") {
          setPhase("arriving");
          revealAt = now + TRAVEL_REVEAL_MS;
        }
      } else if (phase === "arriving" && now >= revealAt) {
        setPhase("idle");
      }
    } catch (error) {
      notify("render-failed");
      sync();
      console.error("[renderer]", error);
    }
  }
  const sync = () => {
    previous = 0;
    renderer.setAnimationLoop(
      !disposed &&
        status !== "context-lost" &&
        status !== "failed" &&
        (renderer.xr.isPresenting || (!suspended && !document.hidden))
        ? draw
        : null,
    );
  };
  let recoveryDeadline: ReturnType<typeof setTimeout> | undefined;
  const lost = () => {
    notify("context-lost");
    sync();
    clearTimeout(recoveryDeadline);
    recoveryDeadline = setTimeout(() => {
      if (!disposed && status === "context-lost") notify("render-failed");
    }, 30_000);
  };
  const restored = () => {
    clearTimeout(recoveryDeadline);
    notify("context-restored");
    sync();
  };
  canvas.addEventListener("webglcontextlost", lost);
  canvas.addEventListener("webglcontextrestored", restored);
  document.addEventListener("visibilitychange", sync);
  sync();
  return {
    canvas,
    camera,
    controls,
    renderer,
    profile,
    scene,
    qualityTier: profile.tier,
    enterImmersive: () => immersive.enterImmersive(),
    isInXr: immersive.isInXr,
    onXrStatus: immersive.onXrStatus,
    beginTravel: () => setPhase("departing"),
    cancelTravel: () => setPhase("idle"),
    onTravelPhase(listener: (value: TravelPhase) => void) {
      phaseListeners.add(listener);
      listener(phase);
      return () => {
        phaseListeners.delete(listener);
      };
    },
    getFps: () => fps,
    onRendererStatus(listener: (value: RendererStatus) => void) {
      listeners.add(listener);
      listener(status);
      return () => listeners.delete(listener);
    },
    suspendRendering() {
      suspended++;
      sync();
      let released = false;
      return () => {
        if (released || disposed) return;
        released = true;
        suspended--;
        sync();
      };
    },
    async mountWorld<W extends Observation>(
      build: () => W | Promise<W>,
      signal?: AbortSignal,
    ): Promise<W | null> {
      if (disposed || signal?.aborted) return null;
      const generation = ++version;
      if (phase === "departing" && !reduced.matches) setPhase("crossing");
      let candidate: W;
      try {
        candidate = await build();
      } catch (error) {
        if (!disposed && generation === version) setPhase("idle");
        throw error;
      }
      if (disposed || signal?.aborted || generation !== version) {
        candidate.dispose();
        if (!disposed && generation === version) setPhase("idle");
        return null;
      }
      active?.root.removeFromParent();
      active?.dispose();
      sky?.dispose();
      sky = createNightSky(profile.starCount, candidate.seed ?? 1812, candidate.skyViewpoint);
      sky.mesh.visible = !immersive.isInXr();
      scene.add(sky.mesh);
      world.add(candidate.root);
      if (phase !== "crossing") setPhase("idle");
      active = candidate;
      immersive.worldChanged();
      controls.reset();
      controls.target.set(0, 0, 0);
      controls.minDistance = candidate.nearDistance;
      controls.maxDistance = candidate.farDistance;
      camera.position.copy(direction).multiplyScalar(candidate.distance);
      controls.update();
      firstFrame = true;
      return candidate;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      version++;
      clearTimeout(recoveryDeadline);
      renderer.setAnimationLoop(null);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      document.removeEventListener("visibilitychange", sync);
      observer.disconnect();
      listeners.clear();
      active?.root.removeFromParent();
      active?.dispose();
      active = null;
      sky?.dispose();
      renderer.xr.removeEventListener("sessionstart", saveDesktopView);
      renderer.xr.removeEventListener("sessionend", restoreDesktopView);
      immersive.dispose();
      phaseListeners.clear();
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
