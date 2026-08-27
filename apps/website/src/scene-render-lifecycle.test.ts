import { Observable } from "@babylonjs/core/Misc/observable.js";
import { expect, test, vi } from "vite-plus/test";
import { createRenderLifecycle } from "./scene-render-lifecycle.ts";

const createHarness = () => {
  let frame = (): void => undefined;
  const engine = {
    onContextLostObservable: new Observable<void>(),
    onContextRestoredObservable: new Observable<void>(),
    performanceMonitor: { reset: vi.fn() },
    resize: vi.fn(),
    runRenderLoop: vi.fn((next: () => void) => {
      frame = next;
    }),
    stopRenderLoop: vi.fn(),
  };
  const scene = { render: vi.fn() };
  const resizeTarget = new EventTarget();
  const lifecycle = createRenderLifecycle({
    engine: engine as never,
    isInXr: () => false,
    resizeTarget,
    scene: scene as never,
  });
  return { engine, frame: () => frame(), lifecycle, resizeTarget, scene };
};

test("reports context restoration only after a complete recovery frame", () => {
  const { engine, frame, lifecycle } = createHarness();
  const statuses: string[] = [];
  lifecycle.onStatus((status) => statuses.push(status));

  engine.onContextLostObservable.notifyObservers();
  engine.onContextRestoredObservable.notifyObservers();
  frame();

  expect(statuses).toEqual(["ready", "context-lost", "recovering", "ready"]);
  expect(engine.resize).toHaveBeenCalledOnce();
});

test("contains a failed frame and leaves the renderer failed", () => {
  const { engine, frame, lifecycle, scene } = createHarness();
  const statuses: string[] = [];
  lifecycle.onStatus((status) => statuses.push(status));
  scene.render.mockImplementationOnce(() => {
    throw new Error("draw failed");
  });

  frame();

  expect(statuses).toEqual(["ready", "failed"]);
  expect(lifecycle.isRunning).toBe(false);
  expect(engine.stopRenderLoop).toHaveBeenCalledOnce();
});

test("nests suspensions and resumes only after the final release", () => {
  const { engine, lifecycle } = createHarness();
  const releaseFirst = lifecycle.suspend();
  const releaseSecond = lifecycle.suspend();

  expect(lifecycle.suspensionCount).toBe(2);
  expect(engine.stopRenderLoop).toHaveBeenCalledOnce();
  releaseFirst();
  expect(lifecycle.isRunning).toBe(false);
  releaseSecond();
  expect(lifecycle.isRunning).toBe(true);
  expect(engine.runRenderLoop).toHaveBeenCalledTimes(2);
});

test("disposal removes resize and status ownership", () => {
  const { engine, lifecycle, resizeTarget } = createHarness();
  const listener = vi.fn();
  lifecycle.onStatus(listener);
  lifecycle.dispose();

  resizeTarget.dispatchEvent(new Event("resize"));
  engine.onContextLostObservable.notifyObservers();

  expect(engine.resize).not.toHaveBeenCalled();
  expect(listener).toHaveBeenCalledOnce();
});
