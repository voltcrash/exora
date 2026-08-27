import { expect, test, vi } from "vite-plus/test";
import { createSceneHostRegistry, type RegisteredSceneHost } from "./scene-host-registry.ts";

interface TestHost extends RegisteredSceneHost<object> {
  id: number;
}

test("ordinary acquisition preserves the renderer for the same canvas", () => {
  let nextId = 0;
  const create = vi.fn((canvas: object): TestHost => ({
    canvas,
    dispose: vi.fn(),
    id: (nextId += 1),
  }));
  const registry = createSceneHostRegistry(create);
  const canvas = {};

  const first = registry.acquire(canvas);
  const second = registry.acquire(canvas);

  expect(second).toBe(first);
  expect(create).toHaveBeenCalledOnce();
  expect(first.dispose).not.toHaveBeenCalled();
});

test("renderer recovery disposes and replaces the host without replacing its canvas", () => {
  let nextId = 0;
  const registry = createSceneHostRegistry<object, TestHost>((canvas) => ({
    canvas,
    dispose: vi.fn(),
    id: (nextId += 1),
  }));
  const canvas = {};
  const failed = registry.acquire(canvas);

  const recovered = registry.recreate(canvas);

  expect(failed.dispose).toHaveBeenCalledOnce();
  expect(recovered).not.toBe(failed);
  expect(recovered.canvas).toBe(canvas);
});

test("a host that disposes itself cannot be acquired again", () => {
  let nextId = 0;
  const registry = createSceneHostRegistry<object, TestHost>((canvas) => ({
    canvas,
    dispose: vi.fn(),
    id: (nextId += 1),
  }));
  const canvas = {};
  const disposed = registry.acquire(canvas);

  registry.forget(disposed);
  const replacement = registry.acquire(canvas);

  expect(replacement).not.toBe(disposed);
});
