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

export const chooseImmersiveDestination = ({
  ar,
  launchUrl,
  vr,
}: ImmersiveSupport): ImmersiveDestination => {
  if (vr) return { launchUrl: null, mode: "vr" };
  if (ar) return { launchUrl: null, mode: "ar" };
  return launchUrl ? { launchUrl, mode: "ar" } : null;
};

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

export const onVariantLaunchReady = (listener: () => void): (() => void) => {
  window.addEventListener("exora:variant-launch-ready", listener);
  if (window.__exoraVariantLaunchDetail) listener();
  return () => window.removeEventListener("exora:variant-launch-ready", listener);
};
