import { expect, test, vi } from "vite-plus/test";
import { Group, Scene, PerspectiveCamera, type WebGLRenderer } from "three";
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
    xr: {
      setReferenceSpaceType: vi.fn(),
      setSession: vi.fn(),
      getReferenceSpace: () => ({}),
      getCamera: () => new PerspectiveCamera(),
    },
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
    const overlay = document.getElementById("ar-overlay")!;
    expect(document.documentElement.dataset.presentationMode).toBe("ar");
    overlay.querySelector<HTMLButtonElement>(".ar-background-toggle")!.click();
    expect(renderer.setClearAlpha).toHaveBeenLastCalledWith(1);
    const pointer = (name: string, id: number, x: number, y: number) => {
      overlay.dispatchEvent(
        new PointerEvent(name, { pointerId: id, clientX: x, clientY: y, bubbles: true }),
      );
    };
    pointer("pointerdown", 1, 20, 20);
    pointer("pointermove", 1, 40, 20);
    expect(world.position.x).toBeGreaterThan(1);
    pointer("pointerdown", 2, 80, 20);
    pointer("pointermove", 2, 120, 20);
    expect(world.scale.x).toBeCloseTo(0.12);
    ar.worldChanged();
    expect(world.scale.x).toBeCloseTo(0.06);
    const moved = world.position.clone();
    pointer("pointermove", 1, 100, 100);
    expect(world.position.equals(moved)).toBe(true);
    session.dispatchEvent(new Event("select"));
    expect(world.position.equals(moved)).toBe(true);
    const pinch = new Event("gesturestart", { cancelable: true });
    document.dispatchEvent(pinch);
    expect(pinch.defaultPrevented).toBe(true);
    overlay.querySelector<HTMLButtonElement>(".ar-back-button")!.click();
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
