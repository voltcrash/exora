import { useEffect, useState, type ReactNode } from "react";

export const DeferredTelemetry = () => {
  const [telemetry, setTelemetry] = useState<ReactNode>(null);

  useEffect(() => {
    let active = true;
    let idleId: number | undefined;
    let timeoutId: number | undefined;
    let started = false;
    const load = (): void => {
      if (!active || started) return;
      started = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      void Promise.all([import("@vercel/analytics/react"), import("@vercel/speed-insights/react")])
        .then(([{ Analytics }, { SpeedInsights }]) => {
          if (active) {
            setTelemetry(
              <>
                <Analytics />
                <SpeedInsights />
              </>,
            );
          }
        })
        .catch(() => undefined);
    };
    timeoutId = window.setTimeout(load, 2_000);
    const frameId = window.requestAnimationFrame(() => {
      if (typeof window.requestIdleCallback === "function") {
        idleId = window.requestIdleCallback(load, { timeout: 2_000 });
      }
    });

    return () => {
      active = false;
      window.cancelAnimationFrame(frameId);
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  return telemetry;
};
