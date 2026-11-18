import { expect, test, vi } from "vite-plus/test";
import { Group, Scene, type WebGLRenderer } from "three";
import { createImmersive } from "./immersive.ts";

test("AR requests a connected overlay, places the world on a hit and restores it on exit", async () => {
  const source = { cancel: vi.fn() };
  const session = Object.assign(new EventTarget(), {
    requestReferenceSpace: async () => ({}),
    requestHitTestSource: async () => source,
    end: async () => {
      session.dispatchEvent(new Event("end"));
    },
  });
  const requestSession = vi.fn(async (_: string, options: XRSessionInit) => {
    expect(options.domOverlay?.root.isConnected).toBe(true);
    return session;
  });
  const previous = Object.getOwnPropertyDescriptor(navigator, "xr");
  Object.defineProperty(navigator, "xr", {
    configurable: true,
    value: { isSessionSupported: async () => true, requestSession },
  });
  const renderer = {
    xr: { setReferenceSpaceType: vi.fn(), setSession: vi.fn(), getReferenceSpace: () => ({}) },
    setClearAlpha: vi.fn(),
  };
  const world = new Group(),
    scene = new Scene(),
    change = vi.fn();
  const ar = createImmersive(renderer as unknown as WebGLRenderer, scene, world, () => 10, change);
  try {
    await Promise.resolve();
    await Promise.resolve();
    await ar.enterImmersive();
    expect(requestSession).toHaveBeenCalledOnce();
    expect(world.visible).toBe(false);
    ar.frame({
      getHitTestResults: () => [
        {
          getPose: () => ({
            transform: {
              matrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1]),
            },
          }),
        },
      ],
    } as unknown as XRFrame);
    session.dispatchEvent(new Event("select"));
    expect(world.visible).toBe(true);
    expect(world.position.toArray()).toEqual([1, 2.16, 3]);
    expect(world.scale.x).toBeCloseTo(0.06);
    await session.end();
    expect(source.cancel).toHaveBeenCalledOnce();
    expect(change.mock.calls).toEqual([[true], [false]]);
    expect(world.scale.x).toBe(1);
    expect(world.position.length()).toBe(0);
    expect(document.getElementById("ar-overlay")).toBeNull();
  } finally {
    ar.dispose();
    if (previous) Object.defineProperty(navigator, "xr", previous);
    else Reflect.deleteProperty(navigator, "xr");
  }
});
