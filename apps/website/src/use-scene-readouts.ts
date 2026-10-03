import { useEffect, useState } from "react";
import type { SceneHost, XrStatus } from "./scene-host.ts";

/** The renderer's frame rate, sampled once a second; "--" until the host exists. */
export const useFrameRate = (host: SceneHost | null): string => {
  const [fps, setFps] = useState("--");
  useEffect(() => {
    if (!host) return;
    const timer = window.setInterval(() => setFps(Math.round(host.getFps()).toString()), 1_000);
    return () => window.clearInterval(timer);
  }, [host]);
  return fps;
};

/** Whether this device can enter VR or AR right now. */
export const useXrStatus = (host: SceneHost | null): XrStatus => {
  const [status, setStatus] = useState<XrStatus>("checking");
  useEffect(() => host?.onXrStatus(setStatus), [host]);
  return status;
};
