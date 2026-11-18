import { preloadInitialDestination } from "../route-assets.ts";
import { useEffect, useState } from "react";
import type { Observatory } from "./observatory.ts";
import type { RendererStatus } from "../renderer-recovery.ts";

export function useObservatory(canvas: HTMLCanvasElement | null) {
  const [host, setHost] = useState<Observatory | null>(null);
  const [status, setStatus] = useState<RendererStatus | "initializing">("initializing");
  useEffect(() => {
    let abandoned = false,
      instance: Observatory | undefined;
    setHost(null);
    setStatus("initializing");
    if (!canvas) return;
    void preloadInitialDestination(window.location.search).catch(() => undefined);
    void import("./observatory.ts")
      .then(({ createObservatory }) => {
        if (abandoned) return;
        instance = createObservatory(canvas);
        instance.onRendererStatus(setStatus);
        setHost(instance);
      })
      .catch((error: unknown) => {
        if (!abandoned) {
          console.error("[observatory]", error);
          setStatus("failed");
        }
      });
    return () => {
      abandoned = true;
      instance?.dispose();
    };
  }, [canvas]);
  return { host: host?.canvas === canvas ? host : null, status };
}
