export type ImmersiveMode = "ar" | "vr";

interface VariantLaunchSdk {
  getLaunchUrl: (targetUrl: string) => string;
}

interface VariantLaunchDetail {
  launchRequired: boolean;
  launchUrl: string;
  webXRStatus: "launch-required" | "supported" | "unsupported";
}

declare global {
  interface Window {
    __exoraVariantLaunchDetail?: VariantLaunchDetail;
    VLaunch?: VariantLaunchSdk;
  }
}

export interface ImmersiveSupport {
  ar: boolean;
  launchUrl: string | null;
  vr: boolean;
}

export type ImmersiveDestination = { launchUrl: string | null; mode: ImmersiveMode } | null;

/**
 * Chooses one presentation without changing Quest's established preference for VR.
 *
 * Some headsets expose both session modes, while phones expose AR alone. Selecting VR first is
 * what keeps a Quest tap entering the same opaque `immersive-vr` session it did before AR was
 * added; AR becomes the natural fallback on an AR-capable phone or through Variant Launch.
 */
export const chooseImmersiveDestination = ({
  ar,
  launchUrl,
  vr,
}: ImmersiveSupport): ImmersiveDestination => {
  if (vr) return { launchUrl: null, mode: "vr" };
  if (ar) return { launchUrl: null, mode: "ar" };
  return launchUrl ? { launchUrl, mode: "ar" } : null;
};

/**
 * Returns the recommended Variant Launch Card handoff when its configured SDK is ready.
 *
 * The small Apple-mobile gate prevents Variant's URL factory from turning a desktop with no XR
 * hardware into a false AR offer. Variant's initialization result then decides whether this
 * particular iPhone/iPad needs the handoff; its viewer falls through to ordinary WebXR detection.
 */
export const getVariantLaunchUrl = (): string | null => {
  const appleMobile =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (!appleMobile) return null;
  const initialized = window.__exoraVariantLaunchDetail;
  if (initialized) return initialized.launchRequired ? initialized.launchUrl || null : null;
  const sdk = window.VLaunch;
  if (!sdk) return null;
  try {
    const launchUrl = sdk.getLaunchUrl(window.location.href);
    return launchUrl || null;
  } catch (error) {
    console.warn("[xr] Variant Launch could not create an iPhone handoff", error);
    return null;
  }
};

/** Re-evaluates iPhone availability when Variant's asynchronous device check completes. */
export const onVariantLaunchReady = (listener: () => void): (() => void) => {
  window.addEventListener("exora:variant-launch-ready", listener);
  if (window.__exoraVariantLaunchDetail) listener();
  return () => window.removeEventListener("exora:variant-launch-ready", listener);
};
