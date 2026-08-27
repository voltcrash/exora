import { chooseImmersiveDestination, type ImmersiveDestination } from "./variant-launch.ts";

export type XrStatus =
  | "checking"
  | "entering"
  | "in-xr"
  | "ready-ar"
  | "ready-ar-launch"
  | "ready-vr"
  | "unavailable";

interface XrSystemLike {
  isSessionSupported: (mode: "immersive-ar" | "immersive-vr") => Promise<boolean>;
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
  isVrSupported: () => boolean;
  markEntering: () => void;
  markInXr: () => void;
  markReady: () => void;
  onStatus: (listener: (status: XrStatus) => void) => () => void;
}

const statusFor = (destination: ImmersiveDestination): XrStatus => {
  if (!destination) return "unavailable";
  if (destination.mode === "vr") return "ready-vr";
  return destination.launchUrl ? "ready-ar-launch" : "ready-ar";
};

/** Owns XR capability discovery and the user-visible status around the persistent session. */
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
    vr: false,
  });
  let status: XrStatus = "checking";
  let vrSupported = false;
  const listeners = new Set<(status: XrStatus) => void>();

  const setStatus = (next: XrStatus): void => {
    status = next;
    for (const listener of listeners) listener(next);
  };

  const markReady = (): void => setStatus(statusFor(destination));

  const refresh = async (): Promise<void> => {
    const system = xrSystem();
    [arSupported, vrSupported] = system
      ? await Promise.all([
          system.isSessionSupported("immersive-ar").catch(() => false),
          system.isSessionSupported("immersive-vr").catch(() => false),
        ])
      : [false, false];
    if (disposed) return;
    destination = chooseImmersiveDestination({
      ar: arSupported,
      launchUrl: getLaunchUrl(),
      vr: vrSupported,
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
    isVrSupported: () => vrSupported,
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
