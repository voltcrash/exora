import { expect, test } from "vite-plus/test";
import { acquireSceneHost } from "./scene-host.ts";
import { createBlackHoleWorld } from "./black-hole-scene.ts";
import { BLACK_HOLES } from "./black-holes.ts";

test("a real WebGL host draws, suspends, resumes and releases its scene", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 240;
  canvas.height = 180;
  document.body.append(canvas);
  const host = await acquireSceneHost(canvas);
  try {
    let drawn = false;
    const world = await host.mountWorld(() =>
      createBlackHoleWorld(host, {
        blackHole: BLACK_HOLES[0]!,
        onFirstFrame: () => {
          drawn = true;
        },
      }),
    );
    expect(world).not.toBeNull();
    await expect.poll(() => drawn).toBe(true);
    let frames = 0;
    const observer = host.scene.onAfterRenderObservable.add(() => {
      frames += 1;
    });
    const release = host.suspendRendering();
    const paused = frames;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    expect(frames).toBe(paused);
    release();
    await expect.poll(() => frames).toBeGreaterThan(paused);
    host.scene.onAfterRenderObservable.remove(observer);
  } finally {
    await host.dispose();
    expect(host.scene.isDisposed).toBe(true);
    canvas.remove();
  }
});

test("a real failed texture becomes a ready neutral map for existing materials", async () => {
  const { getSurfaceDetailTextures, surfaceDetailSelectionForPalette } =
    await import("./texture-cache.ts");
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  const host = await acquireSceneHost(canvas);
  try {
    const selection = surfaceDetailSelectionForPalette("basaltic-dark");
    const maps = getSurfaceDetailTextures(
      host.scene,
      {
        ...selection,
        primary: "missing-state-machine-probe" as typeof selection.primary,
      },
      true,
    );
    await expect.poll(() => maps.primary.normal.url?.startsWith("data:image/png")).toBe(true);
    await expect.poll(() => maps.primary.normal.isReady()).toBe(true);
  } finally {
    await host.dispose();
    canvas.remove();
  }
});
