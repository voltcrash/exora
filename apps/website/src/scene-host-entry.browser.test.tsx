import { afterEach, expect, test, vi } from "vite-plus/test";
import { acquireSceneHost } from "./scene-host.ts";
import { createBlackHoleWorld } from "./black-hole-scene.ts";
import { BLACK_HOLES } from "./black-holes.ts";

const xrRuntime = vi.hoisted(() => ({ initialize: vi.fn() }));
vi.mock("./xr-runtime.ts", () => ({
  WebXRDefaultExperience: { CreateAsync: () => xrRuntime.initialize() },
}));
vi.mock("./scene-xr-integration.ts", () => ({
  createXrIntegration: () => ({
    destination: { launchUrl: null },
    dispose: vi.fn(),
    isArSupported: () => true,
    markEntering: vi.fn(),
    markInXr: vi.fn(),
    markReady: vi.fn(),
    markFailed: vi.fn(),
    onStatus: () => () => undefined,
  }),
}));

afterEach(() => vi.restoreAllMocks());

test("only the latest live destination mounts after pending AR initialization settles", async () => {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
  let rejectEntry = (_reason: Error): void => undefined;
  const initialization = new Promise<never>((_resolve, reject) => {
    rejectEntry = reject;
  });
  xrRuntime.initialize.mockReturnValue(initialization);
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  const host = await acquireSceneHost(canvas);
  try {
    await host.mountWorld(() =>
      createBlackHoleWorld(host, { blackHole: BLACK_HOLES[0]!, onFirstFrame: () => undefined }),
    );
    const entry = host.enterImmersive().catch(() => undefined);
    await expect.poll(() => xrRuntime.initialize.mock.calls.length).toBeGreaterThan(0);
    const obsolete = vi.fn(() => ({ dispose: vi.fn(), restoreDesktopView: vi.fn() }));
    const cancelled = vi.fn(() => ({ dispose: vi.fn(), restoreDesktopView: vi.fn() }));
    const latest = vi.fn(() => ({ dispose: vi.fn(), restoreDesktopView: vi.fn() }));
    const first = host.mountWorld(obsolete);
    const controller = new AbortController();
    const second = host.mountWorld(cancelled, controller.signal);
    controller.abort();
    const third = host.mountWorld(latest);
    expect(latest).not.toHaveBeenCalled();
    rejectEntry(new Error("AR access declined"));
    await entry;
    expect(await first).toBeNull();
    expect(await second).toBeNull();
    expect(await third).not.toBeNull();
    expect(obsolete).not.toHaveBeenCalled();
    expect(cancelled).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
  } finally {
    const disposing = host.dispose();
    expect(host.dispose()).toBe(disposing);
    await disposing;
    canvas.remove();
  }
});
