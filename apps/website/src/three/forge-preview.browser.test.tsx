import { deriveWorldRecipe } from "@exora/worldgen";
import { TextureLoader } from "three";
import { expect, test, vi } from "vite-plus/test";
import { JUPITER, MARS } from "../solar-system.ts";
import { createForgePreview } from "./forge-preview.ts";

test("Forge can switch between surface families while the first rocky texture is loading", async () => {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "width:160px;height:160px";
  document.body.append(canvas);
  const load = vi.spyOn(TextureLoader.prototype, "load");
  const drawn = vi.fn(),
    fallback = vi.fn();
  const preview = createForgePreview(canvas, drawn, fallback);
  const giant = deriveWorldRecipe(JUPITER),
    rocky = deriveWorldRecipe(MARS);
  try {
    preview.setWorld(giant);
    await vi.waitFor(() => expect(drawn).toHaveBeenCalledOnce(), { timeout: 8000 });
    expect(load.mock.calls.map(([url]) => url)).toEqual(["/textures/fields/convection.png"]);
    preview.setWorld(rocky);
    expect(fallback).toHaveBeenCalledOnce();
    preview.setWorld(giant);
    expect(drawn).toHaveBeenCalledTimes(2);
    preview.setWorld(rocky);
    await vi.waitFor(() => expect(drawn).toHaveBeenCalledTimes(3), { timeout: 8000 });
    expect(load.mock.calls.map(([url]) => url)).toEqual([
      "/textures/fields/convection.png",
      "/textures/fields/lithosphere.png",
    ]);
  } finally {
    preview.dispose();
    load.mockRestore();
    canvas.remove();
  }
});
