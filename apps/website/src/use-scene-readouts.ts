import { useEffect, useState } from "react";
import type { ViewerControls, XrStatus } from "./scene-host.ts";

/** The renderer's frame rate, sampled once a second; "--" until the host exists. */
export const useFrameRate = (host: ViewerControls | null): string => {
  const [fps, setFps] = useState("--");
  useEffect(() => {
    setFps("--");
    if (!host) return;
    const timer = window.setInterval(() => setFps(Math.round(host.getFps()).toString()), 1_000);
    return () => window.clearInterval(timer);
  }, [host]);
  return fps;
};

/** Whether this device can enter AR right now. */
export const useXrStatus = (host: ViewerControls | null): XrStatus => {
  const [status, setStatus] = useState<XrStatus>("checking");
  useEffect(() => {
    setStatus("checking");
    return host?.onXrStatus(setStatus);
  }, [host]);
  return status;
};
