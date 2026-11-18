import { expect, test } from "vite-plus/test";
import { deriveWorldRecipe } from "@exora/worldgen";
import { PerspectiveCamera, RepeatWrapping, Scene, TextureLoader, WebGLRenderer } from "three";
import { EARTH, JUPITER, NEPTUNE } from "../solar-system.ts";
import { createPlanetGlobe } from "./planet-globe.ts";

test("Blender fields shade rocky, gas and ice planets with distinct lit surfaces", async () => {
  const renderer = new WebGLRenderer();
  renderer.setSize(128, 128, false);
  const gl = renderer.getContext();
  const loader = new TextureLoader();
  const maps = await Promise.all(
    ["lithosphere", "convection"].map((name) => loader.loadAsync(`/textures/fields/${name}.png`)),
  );
  const camera = new PerspectiveCamera(36, 1, 0.01, 100);
  const scene = new Scene();
  const signatures = new Set<string>();
  try {
    for (const map of maps) map.wrapS = RepeatWrapping;
    for (const profile of [EARTH, JUPITER, NEPTUNE]) {
      const recipe = deriveWorldRecipe(profile);
      const globe = createPlanetGlobe(recipe, maps[0]!, maps[1]!, 64);
      try {
        scene.add(globe.root);
        camera.position.z = recipe.radiusSceneUnits * 3.6;
        globe.update(1, 0);
        renderer.render(scene, camera);
        const pixels = new Uint8Array(128 * 128 * 4);
        gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const sample = (x: number, y: number) =>
          Array.from(pixels.subarray((y * 128 + x) * 4, (y * 128 + x) * 4 + 3));
        expect(sample(0, 0)).toEqual([0, 0, 0]);
        const samples = [32, 48, 64, 80, 96].map((x) => sample(x, 68));
        expect(samples[0]!.reduce((a, b) => a + b, 0)).toBeGreaterThan(
          samples[4]!.reduce((a, b) => a + b, 0),
        );
        signatures.add(JSON.stringify(samples));
        if (profile === JUPITER) {
          // A complete advection cycle must preserve cloud detail even after hours of viewing.
          globe.update(1 + 6 * 2048, 0);
          renderer.render(scene, camera);
          const late = new Uint8Array(pixels.length);
          gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, late);
          const error = late.reduce(
            (sum, value, index) => sum + Math.abs(value - pixels[index]!),
            0,
          );
          expect(error / late.length).toBeLessThan(0.2);
        }
      } finally {
        globe.dispose();
      }
    }
    expect(signatures.size).toBe(3);
  } finally {
    for (const map of maps) map.dispose();
    renderer.dispose();
  }
});
