import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Rgb, WorldRecipe } from "@exora/worldgen";

const toColor3 = ([red, green, blue]: Rgb): Color3 => new Color3(red, green, blue);

/** Creates the world-owned key light while the host keeps ownership of the shared scene. */
export const createPlanetKeyLight = (
  scene: Scene,
  direction: Vector3,
  star: WorldRecipe["star"],
): DirectionalLight => {
  const light = new DirectionalLight("stellarLight", direction.scale(-1), scene);
  light.diffuse = toColor3(star.color);
  light.intensity = 2.2 * star.intensity;
  return light;
};
