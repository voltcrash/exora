import type { Scene } from "@babylonjs/core/scene.js";
import { openWorldScope, type WorldScope } from "./world-scope.ts";

export interface DisposableWorld {
  dispose: () => void;
}

export interface SceneMountSlot<World extends DisposableWorld> {
  readonly current: World | null;
  readonly scope: WorldScope | null;
  /** Disposes the mounted world immediately, or waits for an in-flight build to clean itself up. */
  dispose: () => Promise<void>;
  /**
   * Replaces the current world inside one serialized ownership window.
   *
   * `accept` is checked before construction and after every asynchronous build so an overtaken
   * destination never becomes visible. A rejected completion is still fully disposed.
   */
  replace: <Next extends World>(
    build: () => Promise<Next> | Next,
    accept: () => boolean,
  ) => Promise<Next | null>;
}

export interface SceneMountHooks {
  /** Runs before the old scope is removed, for host-owned references into that scope. */
  beforeRemove?: () => void;
  /** Restores host scene defaults after the old world has been removed. */
  prepareScene?: () => void;
}

/**
 * Owns the destination-sized part of a persistent Babylon scene.
 *
 * The engine and scene are deliberately inputs, not products: replacing a world must never
 * replace the WebGL context that a WebXR session belongs to. Only resources captured by the
 * world's scope are reclaimed here.
 */
export const createSceneMountSlot = <World extends DisposableWorld>(
  scene: Scene,
  hooks: SceneMountHooks = {},
): SceneMountSlot<World> => {
  let current: World | null = null;
  let scope: WorldScope | null = null;
  let buildGate = Promise.resolve();
  let disposed = false;

  const removeCurrent = (): void => {
    hooks.beforeRemove?.();
    current?.dispose();
    scope?.dispose();
    current = null;
    scope = null;
  };

  return {
    get current() {
      return current;
    },
    get scope() {
      return scope;
    },
    dispose: async () => {
      if (disposed) return buildGate;
      disposed = true;
      removeCurrent();
      await buildGate;
    },
    replace: async <Next extends World>(
      build: () => Promise<Next> | Next,
      accept: () => boolean,
    ): Promise<Next | null> => {
      const precedingBuild = buildGate;
      let releaseBuildGate = (): void => undefined;
      buildGate = new Promise<void>((resolve) => {
        releaseBuildGate = resolve;
      });
      await precedingBuild;

      try {
        if (disposed || !accept()) return null;

        removeCurrent();
        hooks.prepareScene?.();

        const nextScope = openWorldScope(scene);
        let next: Next;
        try {
          next = await build();
        } catch (error) {
          // A loader can fail after adding meshes and materials. Seal the partial difference so
          // the shared scene is restored before the failure reaches the renderer recovery path.
          nextScope.seal();
          nextScope.dispose();
          throw error;
        }
        nextScope.seal();

        if (disposed || !accept()) {
          next.dispose();
          nextScope.dispose();
          return null;
        }

        current = next;
        scope = nextScope;
        return next;
      } finally {
        releaseBuildGate();
      }
    },
  };
};
