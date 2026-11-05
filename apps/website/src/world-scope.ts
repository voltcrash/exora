import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import { isSceneTexture } from "./texture-ownership.ts";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { AbstractActionManager } from "@babylonjs/core/Actions/abstractActionManager.js";
import type { Light } from "@babylonjs/core/Lights/light.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import type { WorldPresentation } from "./world-presentation.ts";

export interface WorldScope {
  dispose: () => void;
  seal: () => Promise<void>;
  presentation: WorldPresentation;
}

interface SceneContents {
  actionManagers: readonly AbstractActionManager[];
  lights: readonly Light[];
  materials: readonly Material[];
  meshes: readonly AbstractMesh[];
  transformNodes: readonly TransformNode[];
  textures: readonly BaseTexture[];
}

const read = (scene: Scene): SceneContents => ({
  actionManagers: [...scene.actionManagers],
  lights: [...scene.lights],
  materials: [...scene.materials],
  meshes: [...scene.meshes],
  transformNodes: [...scene.transformNodes],
  textures: [...scene.textures],
});

const addedSince = <Item>(before: readonly Item[], after: readonly Item[]): Item[] => {
  const existing = new Set(before);
  return after.filter((item) => !existing.has(item));
};

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
  // Snapshot the persistent scene so only destination-owned resources are disposed.
  const before = read(scene);
  let presentation: WorldPresentation | null = null;
  let owned: SceneContents | null = null;
  let disposed = false;

  const collect = (): void => {
    const after = read(scene);
    owned = {
      actionManagers: addedSince(before.actionManagers, after.actionManagers),
      lights: addedSince(before.lights, after.lights),
      materials: addedSince(before.materials, after.materials),
      meshes: addedSince(before.meshes, after.meshes),
      transformNodes: addedSince(before.transformNodes, after.transformNodes),
      textures: addedSince(before.textures, after.textures).filter(
        (texture) => !isSceneTexture(texture),
      ),
    };
  };

  return {
    get presentation() {
      if (!presentation) throw new Error("A world presentation is unavailable before sealing.");
      return presentation;
    },
    seal: async () => {
      collect();
      const { createWorldPresentation } = await import("./world-presentation.ts");
      presentation = await createWorldPresentation(scene);
      presentation.capture(owned!);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      if (!owned) collect();
      const contents = owned!;
      owned = null;
      presentation?.dispose();
      presentation?.proxy.dispose(false, false);
      presentation = null;
      disposeOwned(contents.meshes, scene.meshes, (mesh) => mesh.dispose(true, false));
      disposeOwned(contents.actionManagers, scene.actionManagers, (manager) => manager.dispose());
      disposeOwned(contents.transformNodes, scene.transformNodes, (node) => node.dispose(true));
      disposeOwned(contents.materials, scene.materials, (material) =>
        material.dispose(false, false),
      );
      disposeOwned(contents.textures, scene.textures, (texture) => texture.dispose());
      disposeOwned(contents.lights, scene.lights, (light) => light.dispose());
    },
  };
};
