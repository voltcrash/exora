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

/**
 * Gives the first React paint a chance to reach the screen before the Babylon graph is evaluated.
 *
 * The renderer is intentionally dynamic, but a passive effect can still run before the browser's
 * next paint when the canvas ref causes a follow-up render. A zero-delay task queued from the next
 * animation frame crosses that paint boundary without adding a human-visible startup delay.
 */
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

/** Starts fetching the destination renderer while the shared Babylon host is being evaluated. */
const preloadInitialScene = (asset: InitialSceneAsset): Promise<unknown> => {
  switch (asset) {
    case "asteroid":
      return import("./small-body-scene.ts");
    case "black-hole":
      return import("./black-hole-scene.ts");
    case "comet":
      return import("./comet-scene.ts");
    case "mission":
      return import("./mission-scene.ts");
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

/**
 * The shared renderer, resolved once the Babylon bundle has loaded.
 *
 * The host is deliberately owned above the planet and star views rather than inside them: it
 * holds the WebGL context an immersive session is bound to, so it has to survive React swapping
 * one view for the other. A restart deliberately replaces that host, causing the active view to
 * remount its world on a fresh engine without losing the selected destination in React or the URL.
 */
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
      // The first destination used to wait for this host to finish evaluating before its own
      // renderer request even began. Both graphs are independent until mount, so fetch them in
      // parallel and let the destination find its module warm when the host becomes available.
      void preloadInitialScene(initialSceneAssetForSearch(window.location.search)).catch(
        () => undefined,
      );
      // Started alongside the renderer, not with the first world that wants it. The star catalogue
      // is one memoized download for the life of the page, and a destination builds its sky on the
      // microtask that resolves it — so getting the request out now is what keeps the very first
      // arrival from rendering a frame or two of empty space before its stars appear.
      void import("./sky-catalog.ts").then(({ loadSkyCatalog }) => loadSkyCatalog());
      void import("./scene-host.ts")
        .then(({ acquireSceneHost, recreateSceneHost }) => {
          if (cancelled) return;
          const nextHost = attempt === 0 ? acquireSceneHost(canvas) : recreateSceneHost(canvas);
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
