import { expect, test, vi } from "vite-plus/test";
import { createSceneHostRegistry, type RegisteredSceneHost } from "./scene-host-registry.ts";

interface TestHost extends RegisteredSceneHost<object> {
  id: number;
}

test("ordinary acquisition preserves the renderer for the same canvas", async () => {
  let nextId = 0;
  const create = vi.fn((canvas: object): TestHost => ({
    canvas,
    dispose: vi.fn(),
    id: (nextId += 1),
  }));
  const registry = createSceneHostRegistry(create);
  const canvas = {};

  const first = await registry.acquire(canvas);
  const second = await registry.acquire(canvas);

  expect(second).toBe(first);
  expect(create).toHaveBeenCalledOnce();
  expect(first.dispose).not.toHaveBeenCalled();
});

test("renderer recovery disposes and replaces the host without replacing its canvas", async () => {
  let nextId = 0;
  const registry = createSceneHostRegistry<object, TestHost>((canvas) => ({
    canvas,
    dispose: vi.fn(),
    id: (nextId += 1),
  }));
  const canvas = {};
  const failed = await registry.acquire(canvas);

  const recovered = await registry.recreate(canvas);

  expect(failed.dispose).toHaveBeenCalledOnce();
  expect(recovered).not.toBe(failed);
  expect(recovered.canvas).toBe(canvas);
});

test("recovery waits for complete disposal before creating a new engine", async () => {
  let finishDisposal = (): void => undefined;
  const disposal = new Promise<void>((resolve) => {
    finishDisposal = resolve;
  });
  const create = vi
    .fn<(canvas: object) => TestHost>()
    .mockImplementationOnce((canvas) => ({ canvas, dispose: () => disposal, id: 1 }))
    .mockImplementationOnce((canvas) => ({ canvas, dispose: vi.fn(), id: 2 }));
  const registry = createSceneHostRegistry(create);
  const canvas = {};
  await registry.acquire(canvas);

  const recovery = registry.recreate(canvas);
  await Promise.resolve();

  expect(create).toHaveBeenCalledOnce();
  finishDisposal();
  await expect(recovery).resolves.toMatchObject({ canvas, id: 2 });
  expect(create).toHaveBeenCalledTimes(2);
});

test("a host that disposes itself cannot be acquired again", async () => {
  let nextId = 0;
  const registry = createSceneHostRegistry<object, TestHost>((canvas) => ({
    canvas,
    dispose: vi.fn(),
    id: (nextId += 1),
  }));
  const canvas = {};
  const disposed = await registry.acquire(canvas);

  registry.forget(disposed);
  const replacement = await registry.acquire(canvas);

  expect(replacement).not.toBe(disposed);
});

test("acquisition waits for an ongoing restart and reuses its replacement", async () => {
  let finish = (): void => undefined;
  let id = 0;
  const registry = createSceneHostRegistry<object, TestHost>((canvas) => ({
    canvas,
    id: ++id,
    dispose: () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  }));
  const canvas = {};
  await registry.acquire(canvas);
  const restart = registry.recreate(canvas);
  await Promise.resolve();
  const acquiring = registry.acquire(canvas);
  finish();
  expect(await acquiring).toBe(await restart);
  expect(id).toBe(2);
});

test("cleanup disposal is awaited before a restart can create another host", async () => {
  let finish = (): void => undefined;
  let started = (): void => undefined;
  const disposing = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const disposalStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let created = 0;
  const registry = createSceneHostRegistry<object, TestHost>((canvas) => ({
    canvas,
    id: ++created,
    dispose: () => {
      started();
      return disposing;
    },
  }));
  const canvas = {};
  const host = await registry.acquire(canvas);
  const cleanup = registry.release(host);
  await disposalStarted;
  const restarting = registry.recreate(canvas);
  await Promise.resolve();
  expect(created).toBe(1);
  finish();
  await cleanup;
  expect((await restarting).id).toBe(2);
});

test("direct host disposal remains a barrier after the host is forgotten", async () => {
  let finish = (): void => undefined;
  const disposal = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let created = 0;
  const registry = createSceneHostRegistry<object, TestHost>((canvas) => ({
    canvas,
    id: ++created,
    dispose: () => disposal,
  }));
  const canvas = {};
  const host = await registry.acquire(canvas);
  registry.forget(host, disposal);
  const next = registry.acquire(canvas);
  await Promise.resolve();
  expect(created).toBe(1);
  finish();
  expect((await next).id).toBe(2);
});
