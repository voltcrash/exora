import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Scene } from "@babylonjs/core/scene.js";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { createSceneMountSlot, type DisposableWorld } from "./scene-mount.ts";

const engines: NullEngine[] = [];

const createScene = (): Scene => {
  const engine = new NullEngine();
  engines.push(engine);
  return new Scene(engine);
};

afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
});

test("replaces only world-owned resources and keeps the persistent scene", async () => {
  const scene = createScene();
  const hostMesh = MeshBuilder.CreateBox("host", undefined, scene);
  const firstDispose = vi.fn();
  const secondDispose = vi.fn();
  const slot = createSceneMountSlot<DisposableWorld>(scene);

  await slot.replace(
    () => {
      MeshBuilder.CreateSphere("first-world", undefined, scene);
      new StandardMaterial("first-material", scene);
      return { dispose: firstDispose };
    },
    () => true,
  );
  const sameScene = scene;

  await slot.replace(
    () => {
      MeshBuilder.CreateSphere("second-world", undefined, scene);
      return { dispose: secondDispose };
    },
    () => true,
  );

  expect(scene).toBe(sameScene);
  expect(scene.meshes.map(({ name }) => name)).toEqual([
    "host",
    "second-world",
    "world-presentation-proxy",
  ]);
  expect(scene.materials).toHaveLength(0);
  expect(hostMesh.isDisposed()).toBe(false);
  expect(firstDispose).toHaveBeenCalledOnce();
  expect(secondDispose).not.toHaveBeenCalled();

  await slot.dispose();
  expect(scene.meshes.map(({ name }) => name)).toEqual(["host"]);
  expect(secondDispose).toHaveBeenCalledOnce();
});

test("sweeps resources from a failed build without replacing the host scene", async () => {
  const scene = createScene();
  MeshBuilder.CreateBox("host", undefined, scene);
  const slot = createSceneMountSlot<DisposableWorld>(scene);

  await expect(
    slot.replace(
      () => {
        MeshBuilder.CreateSphere("partial-world", undefined, scene);
        new StandardMaterial("partial-material", scene);
        throw new Error("asset decode failed");
      },
      () => true,
    ),
  ).rejects.toThrow("asset decode failed");

  expect(scene.meshes.map(({ name }) => name)).toEqual(["host"]);
  expect(scene.materials).toHaveLength(0);
  expect(slot.current).toBeNull();
});

test("disposes an overtaken asynchronous build instead of mounting it", async () => {
  const scene = createScene();
  const worldDispose = vi.fn();
  const slot = createSceneMountSlot<DisposableWorld>(scene);
  let accepted = true;
  let finishBuild = (): void => undefined;
  let markStarted = (): void => undefined;
  const ready = new Promise<void>((resolve) => {
    finishBuild = resolve;
  });
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });

  const mounting = slot.replace(
    async () => {
      MeshBuilder.CreateSphere("overtaken-world", undefined, scene);
      markStarted();
      await ready;
      return { dispose: worldDispose };
    },
    () => accepted,
  );
  await started;
  accepted = false;
  finishBuild();

  await expect(mounting).resolves.toBeNull();
  expect(worldDispose).toHaveBeenCalledOnce();
  expect(scene.meshes).toHaveLength(0);
  expect(slot.current).toBeNull();
});

test("waits for an in-flight build before completing disposal", async () => {
  const scene = createScene();
  const worldDispose = vi.fn();
  const slot = createSceneMountSlot<DisposableWorld>(scene);
  let finishBuild = (): void => undefined;
  let markStarted = (): void => undefined;
  const ready = new Promise<void>((resolve) => {
    finishBuild = resolve;
  });
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const mounting = slot.replace(
    async () => {
      MeshBuilder.CreateSphere("late-world", undefined, scene);
      markStarted();
      await ready;
      return { dispose: worldDispose };
    },
    () => true,
  );
  await started;

  let disposalFinished = false;
  const disposal = slot.dispose().then(() => {
    disposalFinished = true;
  });
  await Promise.resolve();
  expect(disposalFinished).toBe(false);

  finishBuild();
  await mounting;
  await disposal;
  expect(worldDispose).toHaveBeenCalledOnce();
  expect(scene.meshes).toHaveLength(0);
});
