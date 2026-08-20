import { useCallback, useEffect, useState } from "react";
import type { RendererStatus } from "./renderer-recovery.ts";
import type { SceneHost } from "./scene-host.ts";

export type SceneHostStatus = "initializing" | RendererStatus;

export interface SceneHostController {
  host: SceneHost | null;
  restart: () => void;
  status: SceneHostStatus;
}

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
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [attempt, canvas]);

  return { host, restart, status };
};
