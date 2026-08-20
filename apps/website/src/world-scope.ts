/**
 * Everything a world adds to the shared scene, recorded so it can be taken out again.
 *
 * The renderer, the scene and any running immersive session now outlive the world being shown:
 * travelling from a planet to its host star swaps the *contents* of one scene instead of
 * rebuilding the engine, which is the only way a WebXR session can survive the jump. That trade
 * needs a teardown as complete as the `scene.dispose()` it replaces, and asking every builder
 * across a few thousand lines of scene construction to hand back a handle for each thing it made
 * would be both invasive and easy to get quietly wrong.
 *
 * So the scope records what the scene held before the world was built and again the moment it
 * finished. World construction is synchronous, so no other code — not the immersive console, not
 * a controller connecting, not a texture finishing its decode — can add to the scene inside that
 * window: the difference between the two readings is exactly the world and nothing else.
 *
 * Textures are deliberately not tracked. Every texture in these scenes comes from the per-scene
 * cache in `texture-cache.ts`, which is now app-lifetime and is the reason a second visit to a
 * rocky world costs no uploads. Compiled shader effects are left alone for the same reason.
 */

import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { AbstractActionManager } from "@babylonjs/core/Actions/abstractActionManager.js";
import type { Light } from "@babylonjs/core/Lights/light.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";

export interface WorldScope {
  /** Removes everything the world added, leaving the scene as the host set it up. */
  dispose: () => void;
  /** Takes the closing reading. Must be called the instant the world has finished building. */
  seal: () => void;
}

interface SceneContents {
  actionManagers: readonly AbstractActionManager[];
  lights: readonly Light[];
  materials: readonly Material[];
  meshes: readonly AbstractMesh[];
  transformNodes: readonly TransformNode[];
}

const read = (scene: Scene): SceneContents => ({
  actionManagers: [...scene.actionManagers],
  lights: [...scene.lights],
  materials: [...scene.materials],
  meshes: [...scene.meshes],
  transformNodes: [...scene.transformNodes],
});

const addedSince = <Item>(before: readonly Item[], after: readonly Item[]): Item[] => {
  const existing = new Set(before);
  return after.filter((item) => !existing.has(item));
};

/**
 * Disposes the owned entries that the scene still holds.
 *
 * Disposal cascades — a mesh releases its geometry, a scene node releases its children — so an
 * entry can already be gone by the time its turn comes. Checking the scene's own list is what
 * makes the pass safe to run in any order.
 */
const disposeOwned = <Item>(
  owned: readonly Item[],
  current: readonly Item[],
  dispose: (item: Item) => void,
): void => {
  const live = new Set(current);
  for (const item of owned) {
    if (live.has(item)) dispose(item);
  }
};

export const openWorldScope = (scene: Scene): WorldScope => {
  const before = read(scene);
  let owned: SceneContents | null = null;

  return {
    seal: () => {
      const after = read(scene);
      owned = {
        actionManagers: addedSince(before.actionManagers, after.actionManagers),
        lights: addedSince(before.lights, after.lights),
        materials: addedSince(before.materials, after.materials),
        meshes: addedSince(before.meshes, after.meshes),
        transformNodes: addedSince(before.transformNodes, after.transformNodes),
      };
    },
    dispose: () => {
      if (!owned) return;
      const contents = owned;
      owned = null;
      // Meshes first: they own the geometry and the picking hooks that everything else feeds.
      disposeOwned(contents.meshes, scene.meshes, (mesh) => mesh.dispose(true, false));
      disposeOwned(contents.actionManagers, scene.actionManagers, (manager) => manager.dispose());
      disposeOwned(contents.transformNodes, scene.transformNodes, (node) => node.dispose(true));
      // Materials keep their textures: those belong to the scene-lifetime texture cache. The
      // compiled effect is left in the engine's shader cache so the next world of the same kind
      // does not pay to compile it again.
      disposeOwned(contents.materials, scene.materials, (material) =>
        material.dispose(false, false),
      );
      disposeOwned(contents.lights, scene.lights, (light) => light.dispose());
    },
  };
};
