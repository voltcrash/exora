import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { expect, test, vi } from "vite-plus/test";
import { createSceneMountSlot } from "./scene-mount.ts";

vi.mock("./world-presentation.ts", () => ({
  createWorldPresentation: async () => {
    throw new Error("presentation unavailable");
  },
}));

test("presentation failure releases both world callbacks and scene resources", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const slot = createSceneMountSlot(scene);
  const dispose = vi.fn();
  try {
    await expect(
      slot.replace(
        () => {
          MeshBuilder.CreateBox("partial", {}, scene);
          return { dispose };
        },
        () => true,
      ),
    ).rejects.toThrow("presentation unavailable");
    expect(dispose).toHaveBeenCalledOnce();
    expect(scene.meshes).toHaveLength(0);
    expect(slot.current).toBeNull();
  } finally {
    await slot.dispose();
    engine.dispose();
  }
});
