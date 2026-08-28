import { useCallback, useEffect, useState } from "react";
import type { RendererStatus } from "./renderer-recovery.ts";
import { initialSceneAssetForSearch, type InitialSceneAsset } from "./route-assets.ts";
import type { SceneHost } from "./scene-host.ts";

export type SceneHostStatus = "initializing" | RendererStatus;

export interface SceneHostController {
  host: SceneHost | null;
  restart: () => void;
  status: SceneHostStatus;
}

const afterFirstPaint = (callback: () => void): (() => void) => {
  let timeoutId: number | null = null;
  const frameId = window.requestAnimationFrame(() => {
    timeoutId = window.setTimeout(callback, 0);
  });

  return () => {
    window.cancelAnimationFrame(frameId);
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  };
};

const preloadInitialScene = (asset: InitialSceneAsset): Promise<unknown> => {
  switch (asset) {
    case "black-hole":
      return import("./black-hole-scene.ts");
    case "region":
      return import("./solar-region-scene.ts");
    case "star":
      return import("./star-scene.ts");
    case "system":
      return import("./system-scene.ts");
    case "planet":
      return import("./planet-scene.ts");
  }
};

export const useSceneHost = (canvas: HTMLCanvasElement | null): SceneHostController => {
  const [host, setHost] = useState<SceneHost | null>(null);
  const [status, setStatus] = useState<SceneHostStatus>("initializing");
  const [attempt, setAttempt] = useState(0);

  const restart = useCallback(() => {
    setHost(null);
    setStatus("initializing");
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!canvas) return;
    let cancelled = false;
    let unsubscribe = (): void => undefined;
    setStatus("initializing");
    const cancelStartup = afterFirstPaint(() => {
      if (cancelled) return;
      void preloadInitialScene(initialSceneAssetForSearch(window.location.search)).catch(
        () => undefined,
      );
      void import("./sky-catalog.ts").then(({ loadSkyCatalog }) => loadSkyCatalog());
      void import("./scene-host.ts")
        .then(async ({ acquireSceneHost, recreateSceneHost }) => {
          if (cancelled) return;
          const nextHost =
            attempt === 0 ? acquireSceneHost(canvas) : await recreateSceneHost(canvas);
          if (cancelled) {
            await nextHost.dispose();
            return;
          }
          unsubscribe = nextHost.onRendererStatus((nextStatus) => {
            if (!cancelled) setStatus(nextStatus);
          });
          setHost(nextHost);
        })
        .catch((error: unknown) => {
          console.error("[renderer] failed to initialize", error);
          if (!cancelled) setStatus("failed");
        });
    });
    return () => {
      cancelled = true;
      cancelStartup();
      unsubscribe();
    };
  }, [attempt, canvas]);

  return { host, restart, status };
};
