import { expect, test } from "vite-plus/test";
import { createObservatory } from "./observatory.ts";

test("the observatory restores the desktop camera on XR exit and releases a failed departure", async () => {
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  const host = createObservatory(canvas);
  try {
    host.camera.position.set(4, 7, 10);
    host.controls.target.set(1, 2, 3);
    host.controls.update();
    host.renderer.xr.dispatchEvent({ type: "sessionstart" });
    host.camera.position.set(0.4, 0.9, -1);
    host.controls.target.set(0, 0, 0);
    host.renderer.xr.dispatchEvent({ type: "sessionend" });
    expect(host.camera.position.distanceTo({ x: 4, y: 7, z: 10 })).toBeLessThan(0.00001);
    expect(host.controls.target.toArray()).toEqual([1, 2, 3]);
    const phases: string[] = [];
    host.onTravelPhase((value) => phases.push(value));
    host.beginTravel();
    await expect(host.mountWorld(() => Promise.reject(Error("Missing field")))).rejects.toThrow(
      "Missing field",
    );
    expect(phases.at(-1)).toBe("idle");
  } finally {
    host.dispose();
    canvas.remove();
  }
});
