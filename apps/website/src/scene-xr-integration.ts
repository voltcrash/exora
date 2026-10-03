import { chooseImmersiveDestination, type ImmersiveDestination } from "./variant-launch.ts";

export type XrStatus =
  | "checking"
  | "entering"
  | "in-xr"
  | "ready-ar"
  | "ready-ar-launch"
  | "unavailable";

interface XrSystemLike {
  isSessionSupported: (mode: "immersive-ar") => Promise<boolean>;
}

export interface XrIntegrationOptions {
  getLaunchUrl: () => string | null;
  onLaunchReady: (listener: () => void) => () => void;
  xrSystem: () => XrSystemLike | undefined;
}

export interface XrIntegration {
  readonly destination: ImmersiveDestination;
  dispose: () => void;
  isArSupported: () => boolean;
  markEntering: () => void;
  markInXr: () => void;
  markReady: () => void;
  onStatus: (listener: (status: XrStatus) => void) => () => void;
}

const statusFor = (destination: ImmersiveDestination): XrStatus => {
  if (!destination) return "unavailable";
  return destination.launchUrl ? "ready-ar-launch" : "ready-ar";
};

export const createXrIntegration = ({
  getLaunchUrl,
  onLaunchReady,
  xrSystem,
}: XrIntegrationOptions): XrIntegration => {
  let arSupported = false;
  let disposed = false;
  let destination: ImmersiveDestination = chooseImmersiveDestination({
    ar: false,
    launchUrl: getLaunchUrl(),
  });
  let status: XrStatus = "checking";
  const listeners = new Set<(status: XrStatus) => void>();

  const setStatus = (next: XrStatus): void => {
    status = next;
    for (const listener of listeners) listener(next);
  };

  const markReady = (): void => setStatus(statusFor(destination));

  const refresh = async (): Promise<void> => {
    const system = xrSystem();
    arSupported = system
      ? await system.isSessionSupported("immersive-ar").catch(() => false)
      : false;
    if (disposed) return;
    destination = chooseImmersiveDestination({
      ar: arSupported,
      launchUrl: getLaunchUrl(),
    });
    if (status !== "entering" && status !== "in-xr") markReady();
  };

  const stopWatchingLaunch = onLaunchReady(() => void refresh());
  void refresh();

  return {
    get destination() {
      return destination;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      stopWatchingLaunch();
      listeners.clear();
    },
    isArSupported: () => arSupported,
    markEntering: () => setStatus("entering"),
    markInXr: () => setStatus("in-xr"),
    markReady,
    onStatus: (listener) => {
      listeners.add(listener);
      listener(status);
      return () => listeners.delete(listener);
    },
  };
};
