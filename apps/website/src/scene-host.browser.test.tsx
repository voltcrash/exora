import { DirectionalLight, Group, Mesh, Vector3 } from "three";
import { expect, test, vi } from "vite-plus/test";
import { deriveWorldRecipe } from "@exora/worldgen";
import { createObservatory } from "./three/observatory.ts";
import { createPlanetWorld } from "./three/planet.ts";
import { SURFACE_WALK_LIMIT } from "./surface-landing.ts";
import { createLandscape } from "./three/landscape.ts";
import { loadPlanetFields } from "./three/planet-fields.ts";
import { HAUMEA, MARS, tuneSolarWorldRecipe } from "./solar-system.ts";
import { buildSurfaceTerrain } from "./surface-terrain-kernel.ts";
import { surfaceTerrainFixture } from "./terrain-test-fixtures.ts";

function observer() {
  const canvas = document.createElement("canvas");
  canvas.style.width = "240px";
  canvas.style.height = "160px";
  document.body.append(canvas);
  const host = createObservatory(canvas);
  return {
    host,
    canvas,
    close: () => {
      host.dispose();
      canvas.remove();
    },
  };
}
const candidate = () => ({
  root: new Group(),
  distance: 8,
  nearDistance: 1,
  farDistance: 20,
  onFirstFrame: vi.fn(),
  dispose: vi.fn(),
});
test("world replacement keeps the live scene through failures, cancellation and superseded builds", async () => {
  const { host, close } = observer();
  try {
    const first = candidate();
    const scene = host.scene;
    await host.mountWorld(() => first);
    await vi.waitFor(() => expect(first.onFirstFrame).toHaveBeenCalledOnce());
    await expect(host.mountWorld(() => Promise.reject(Error("missing field")))).rejects.toThrow(
      "missing field",
    );
    expect(scene.getObjectById(first.root.id)).toBe(first.root);
    let resolveBuild!: (value: ReturnType<typeof candidate>) => void;
    const pending = new Promise<ReturnType<typeof candidate>>((resolve) => {
      resolveBuild = resolve;
    });
    const superseded = host.mountWorld(() => pending);
    const last = candidate();
    await host.mountWorld(() => last);
    const old = candidate();
    resolveBuild(old);
    expect(await superseded).toBeNull();
    expect(old.dispose).toHaveBeenCalledOnce();
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(scene.getObjectById(last.root.id)).toBe(last.root);
    const controller = new AbortController();
    const cancelled = candidate();
    const building = host.mountWorld(() => cancelled, controller.signal);
    controller.abort();
    expect(await building).toBeNull();
    expect(cancelled.dispose).toHaveBeenCalledOnce();
    const afterClose = candidate();
    const loading = host.mountWorld(() => afterClose);
    host.dispose();
    expect(await loading).toBeNull();
    expect(afterClose.dispose).toHaveBeenCalledOnce();
    expect(last.dispose).toHaveBeenCalledOnce();
  } finally {
    close();
  }
});

test("narrow screens preserve horizontal framing and landscape screens preserve vertical framing", async () => {
  const { host, canvas, close } = observer();
  try {
    expect(host.camera.fov).toBeCloseTo(42);
    canvas.style.height = "480px";
    await vi.waitFor(() => expect(host.camera.aspect).toBeCloseTo(0.5));
    expect(
      (2 * Math.atan(Math.tan((host.camera.fov * Math.PI) / 360) * host.camera.aspect) * 180) /
        Math.PI,
    ).toBeCloseTo(42);
    canvas.style.width = "0";
    await new Promise(requestAnimationFrame);
    expect(Number.isFinite(host.camera.fov)).toBe(true);
  } finally {
    close();
  }
});

test("suspensions nest and a lost graphics context recovers on its first complete frame", async () => {
  const { host, close } = observer();
  try {
    const status: string[] = [];
    host.onRendererStatus((s) => status.push(s));
    const calls = vi.spyOn(host.renderer, "render");
    const a = host.suspendRendering(),
      b = host.suspendRendering();
    a();
    a();
    await new Promise(requestAnimationFrame);
    expect(calls).not.toHaveBeenCalled();
    b();
    await vi.waitFor(() => expect(calls).toHaveBeenCalled());
    host.renderer.forceContextLoss();
    await vi.waitFor(() => expect(status.at(-1)).toBe("context-lost"));
    const count = calls.mock.calls.length;
    const release = host.suspendRendering();
    release();
    await new Promise(requestAnimationFrame);
    expect(calls).toHaveBeenCalledTimes(count);
    host.renderer.forceContextRestore();
    await vi.waitFor(() => expect(status.slice(-2)).toEqual(["recovering", "ready"]));
  } finally {
    close();
  }
});

test("an unrecovered context offers a restart, and a frame failure stops subsequent drawing", async () => {
  const { host, canvas, close } = observer();
  try {
    const status: string[] = [];
    host.onRendererStatus((s) => status.push(s));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    vi.advanceTimersByTime(30000);
    expect(status.at(-1)).toBe("failed");
    vi.useRealTimers();
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    const failed = vi.spyOn(host.renderer, "render").mockImplementation(() => {
      throw Error("test frame failure");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await vi.waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect(status.at(-1)).toBe("failed");
    expect(error).toHaveBeenCalled();
    await new Promise(requestAnimationFrame);
    expect(failed).toHaveBeenCalledOnce();
    error.mockRestore();
  } finally {
    vi.useRealTimers();
    close();
  }
});

test.each([MARS, HAUMEA])(
  "$name lands, walks at reduced animation speed and returns to orbit",
  async (planet) => {
    const { host, canvas, close } = observer();
    const modes: string[] = [];
    let firstFrame!: () => void;
    const arrived = new Promise<void>((resolve) => {
      firstFrame = resolve;
    });
    let onLand!: () => void;
    const landed = new Promise<void>((resolve) => {
      onLand = resolve;
    });
    try {
      const recipe = tuneSolarWorldRecipe(planet, deriveWorldRecipe(planet));
      const world = await host.mountWorld(() =>
        createPlanetWorld(host, {
          planet,
          recipe,
          onViewModeChange: (mode) => {
            modes.push(mode);
            if (mode === "surface") onLand();
          },
          onFirstFrame: firstFrame,
        }),
      );
      await arrived;
      for (let tick = 0; tick < 6; tick++)
        canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, cancelable: true }));
      expect(host.controls.getDistance()).toBeGreaterThan(world!.nearDistance);
      await vi.waitFor(() => expect(modes).toContain("transition"), { timeout: 3000 });
      await landed;
      expect(modes).toEqual(["transition", "surface"]);
      if (planet === HAUMEA) expect(host.camera.position.y).toBeCloseTo(1.65);
      const before = host.camera.position.clone();
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
      world!.update!(0, host.camera, 0.2);
      window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyW" }));
      expect(host.camera.position.distanceTo(before)).toBeGreaterThan(0.1);
      if (planet === MARS) {
        const sunlight = world!.root.getObjectByProperty("type", "DirectionalLight");
        if (!(sunlight instanceof DirectionalLight)) throw Error("Missing surface shadows");
        const lost = new Promise<void>((resolve) => {
          canvas.addEventListener("webglcontextlost", () => resolve(), { once: true });
        });
        host.renderer.forceContextLoss();
        await lost;
        await new Promise(requestAnimationFrame);
        sunlight.shadow.needsUpdate = false;
        const shadowRestored = new Promise<boolean>((resolve) => {
          canvas.addEventListener(
            "webglcontextrestored",
            () => resolve(sunlight.shadow.needsUpdate),
            { once: true },
          );
        });
        host.renderer.forceContextRestore();
        expect(await shadowRestored).toBe(true);
        const capture = vi.spyOn(canvas, "setPointerCapture").mockImplementation(() => {});
        const now = vi.spyOn(performance, "now");
        try {
          now.mockReturnValue(0);
          const event = { pointerType: "touch", pointerId: 7, clientX: 100, clientY: 80 };
          canvas.dispatchEvent(new PointerEvent("pointerdown", event));
          const held = host.camera.position.clone();
          now.mockReturnValue(360);
          world!.update!(0, host.camera, 0.2);
          expect(host.camera.position.distanceTo(held)).toBeGreaterThan(0.1);
          canvas.dispatchEvent(new PointerEvent("pointerup", event));
          const released = host.camera.position.clone();
          world!.update!(0, host.camera, 0.2);
          expect(host.camera.position.distanceTo(released)).toBeLessThan(0.001);
        } finally {
          now.mockRestore();
          capture.mockRestore();
        }
      }
      canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: 10, cancelable: true }));
      expect(modes.at(-1)).toBe("transition");
      await vi.waitFor(() => expect(modes.at(-1)).toBe("orbit"));
      expect(host.controls.enableRotate).toBe(true);
    } finally {
      close();
    }
  },
);

test("the walking floor matches mesh vertices and the surface sun follows the observer", async () => {
  const recipe = tuneSolarWorldRecipe(MARS, deriveWorldRecipe(MARS));
  const fields = await loadPlanetFields();
  const request = surfaceTerrainFixture(MARS, 32);
  if (request.kind !== "surface") throw new Error("Expected a surface request");
  const data = buildSurfaceTerrain(request.input);
  const view = createLandscape(recipe, fields.surface, { geology: request.input.geology, data });
  try {
    const ground = view.root.children.find(
      (object) => object instanceof Mesh && object.geometry.hasAttribute("masks"),
    ) as Mesh;
    const vertices = ground.geometry.getAttribute("position");
    for (const index of [33, 122, 480])
      expect(view.floorAt(vertices.getX(index), vertices.getZ(index))).toBeCloseTo(
        vertices.getY(index),
        3,
      );
    const sunlight = view.root.getObjectByProperty("type", "DirectionalLight");
    if (!(sunlight instanceof DirectionalLight)) throw Error("Missing surface sun");
    view.root.updateMatrixWorld(true);
    sunlight.shadow.updateMatrices(sunlight);
    for (const x of [-SURFACE_WALK_LIMIT, SURFACE_WALK_LIMIT]) {
      for (const z of [-SURFACE_WALK_LIMIT, SURFACE_WALK_LIMIT]) {
        const clip = new Vector3(x, view.floorAt(x, z), z).project(sunlight.shadow.camera);
        expect(Math.max(Math.abs(clip.x), Math.abs(clip.y), Math.abs(clip.z))).toBeLessThan(1);
      }
    }
    const original = view.star.position.clone();
    view.follow(7, -4);
    expect(view.star.position.x - original.x).toBeCloseTo(7);
    expect(view.star.position.z - original.z).toBeCloseTo(-4);
  } finally {
    view.dispose();
    fields.dispose();
  }
});

test("the Martian window admits walkers through its opening and blocks its stone foot", async () => {
  const fields = await loadPlanetFields();
  const request = surfaceTerrainFixture(MARS, 32);
  if (request.kind !== "surface") throw new Error("Expected a surface request");
  const landscape = createLandscape(
    tuneSolarWorldRecipe(MARS, deriveWorldRecipe(MARS)),
    fields.surface,
    {
      geology: request.input.geology,
      data: buildSurfaceTerrain(request.input),
    },
  );
  try {
    const arch = await vi.waitFor(() => {
      const mesh = landscape.root.getObjectByName("sandstone-window");
      if (!mesh) throw new Error("Waiting for the sandstone window");
      return mesh;
    });
    const crossesStone = (x: number) => {
      const start = arch.localToWorld(new Vector3(x, 1.65, 8));
      const end = arch.localToWorld(new Vector3(x, 1.65, -8));
      return landscape.blocks?.(start.x, start.z, end.x, end.z, start.y);
    };
    expect(crossesStone(0.4)).toBe(false);
    expect(crossesStone(-5.5)).toBe(true);
  } finally {
    landscape.dispose();
    fields.dispose();
  }
});
