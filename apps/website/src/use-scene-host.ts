import { useEffect, useState } from "react";
import type { SceneHost } from "./scene-host.ts";

/**
 * The shared renderer, resolved once the Babylon bundle has loaded.
 *
 * The host is deliberately owned above the planet and star views rather than inside them: it
 * holds the WebGL context an immersive session is bound to, so it has to survive React swapping
 * one view for the other. Losing it is exactly what used to eject a wearer from VR mid-journey.
 */
export const useSceneHost = (canvas: HTMLCanvasElement | null): SceneHost | null => {
  const [host, setHost] = useState<SceneHost | null>(null);

  useEffect(() => {
    if (!canvas) return;
    let cancelled = false;
    void import("./scene-host.ts")
      .then(({ acquireSceneHost }) => {
        if (!cancelled) setHost(acquireSceneHost(canvas));
      })
      .catch((error: unknown) => {
        console.error(error);
      });
    return () => {
      cancelled = true;
    };
  }, [canvas]);

  return host;
};
