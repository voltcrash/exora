import type { Engine } from "@babylonjs/core/Engines/engine.js";
import type { Scene } from "@babylonjs/core/scene.js";
import {
  transitionRendererStatus,
  type RendererEvent,
  type RendererStatus,
} from "./renderer-recovery.ts";

export interface RenderLifecycle {
  readonly isRunning: boolean;
  readonly suspensionCount: number;
  dispose: () => void;
  fail: () => void;
  onStatus: (listener: (status: RendererStatus) => void) => () => void;
  renderFrame: () => void;
  start: () => void;
  stop: () => void;
  suspend: () => () => void;
}

export interface RenderLifecycleOptions {
  engine: Engine;
  isInXr: () => boolean;
  resizeTarget: Pick<Window, "addEventListener" | "removeEventListener">;
  scene: Scene;
}

export const createRenderLifecycle = ({
  engine,
  isInXr,
  resizeTarget,
  scene,
}: RenderLifecycleOptions): RenderLifecycle => {
  let disposed = false;
  let looping = false;
  let status: RendererStatus = "ready";
  let suspensions = 0;
  const listeners = new Set<(status: RendererStatus) => void>();

  const dispatch = (event: RendererEvent): void => {
    const next = transitionRendererStatus(status, event);
    if (next === status) return;
    status = next;
    for (const listener of listeners) listener(next);
  };

  const renderFrame = (): void => {
    if (disposed) return;
    if (status === "context-lost") return;
    try {
      scene.render();
      dispatch("frame-rendered");
    } catch (error) {
      console.error("[renderer] frame failed", error);
      dispatch("render-failed");
      engine.stopRenderLoop();
      looping = false;
    }
  };

  const start = (): void => {
    if (looping || disposed) return;
    looping = true;
    engine.performanceMonitor.reset();
    engine.runRenderLoop(renderFrame);
  };

  const stop = (): void => {
    if (!looping) return;
    looping = false;
    engine.stopRenderLoop(renderFrame);
  };

  const suspend = (): (() => void) => {
    suspensions += 1;
    if (suspensions === 1 && !isInXr()) stop();

    let released = false;
    return () => {
      if (released) return;
      released = true;
      suspensions -= 1;
      if (suspensions === 0) start();
    };
  };

  const resize = (): void => {
    engine.resize();
    if (!looping && !disposed) renderFrame();
  };

  engine.onContextLostObservable.add(() => {
    if (disposed) return;
    dispatch("context-lost");
    stop();
  });
  engine.onContextRestoredObservable.add(() => {
    if (disposed) return;
    dispatch("context-restored");
    engine.resize();
    if (suspensions === 0) start();
  });
  resizeTarget.addEventListener("resize", resize);
  start();

  return {
    get isRunning() {
      return looping;
    },
    get suspensionCount() {
      return suspensions;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      resizeTarget.removeEventListener("resize", resize);
      looping = false;
      engine.stopRenderLoop();
    },
    fail: () => dispatch("render-failed"),
    onStatus: (listener) => {
      listeners.add(listener);
      listener(status);
      return () => listeners.delete(listener);
    },
    renderFrame,
    start,
    stop,
    suspend,
  };
};
