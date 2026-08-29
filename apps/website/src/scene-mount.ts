import type { Scene } from "@babylonjs/core/scene.js";
import { openWorldScope, type WorldScope } from "./world-scope.ts";

export interface DisposableWorld {
  dispose: () => void;
}

export interface SceneMountSlot<World extends DisposableWorld> {
  readonly current: World | null;
  readonly scope: WorldScope | null;
  dispose: () => Promise<void>;
  replace: <Next extends World>(
    build: () => Promise<Next> | Next,
    accept: () => boolean,
  ) => Promise<Next | null>;
}

export interface SceneMountHooks {
  beforeRemove?: () => void;
  prepareScene?: () => void;
}

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
          await nextScope.seal();
          nextScope.dispose();
          throw error;
        }
        await nextScope.seal();

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
