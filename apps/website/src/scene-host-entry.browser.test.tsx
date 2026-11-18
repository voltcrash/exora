import { expect, test, vi } from "vite-plus/test";
import { Group } from "three";
import { createObservatory } from "./three/observatory.ts";

test("a world can be superseded while the browser is waiting for AR permission", async () => {
  const previous = Object.getOwnPropertyDescriptor(navigator, "xr");
  let rejectEntry!: (reason: Error) => void;
  const request = new Promise<XRSession>((_resolve, reject) => {
    rejectEntry = reject;
  });
  const requestSession = vi.fn(() => request);
  Object.defineProperty(navigator, "xr", {
    configurable: true,
    value: { isSessionSupported: async () => true, requestSession },
  });
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  const host = createObservatory(canvas);
  try {
    const statuses: string[] = [];
    host.onXrStatus((s) => statuses.push(s));
    await vi.waitFor(() => expect(statuses).toContain("ready-ar"));
    const enter = host.enterImmersive().catch((error: unknown) => error);
    await vi.waitFor(() => expect(requestSession).toHaveBeenCalledOnce());
    const candidate = () => ({
      root: new Group(),
      onFirstFrame: vi.fn(),
      distance: 6,
      nearDistance: 1,
      farDistance: 10,
      dispose: vi.fn(),
    });
    const old = candidate(),
      current = candidate();
    const pending = host.mountWorld(() => old);
    await host.mountWorld(() => current);
    expect(await pending).toBeNull();
    expect(old.dispose).toHaveBeenCalledOnce();
    const denied = Error("AR permission denied");
    rejectEntry(denied);
    expect(await enter).toBe(denied);
    expect(host.scene.getObjectById(current.root.id)).toBe(current.root);
    expect(statuses.at(-1)).toBe("error");
    expect(document.getElementById("ar-overlay")).toBeNull();
  } finally {
    host.dispose();
    canvas.remove();
    if (previous) Object.defineProperty(navigator, "xr", previous);
    else Reflect.deleteProperty(navigator, "xr");
  }
});
