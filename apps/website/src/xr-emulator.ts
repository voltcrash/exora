export type XrEmulatorPreference = "enabled" | "disabled" | "unset";
export type XrEmulatorState = "off" | "installed" | "failed";

export type XrEmulatorHeadset = "quest2" | "quest3";

export interface XrEmulatorRequest {
  enabled: boolean;
  headset: XrEmulatorHeadset;
  persist: XrEmulatorPreference;
  stereo: boolean;
}

const STORAGE_KEY = "exora:xr-emulator";
const ENABLE_VALUES = new Set(["emulate", "emulated", "on", "1", "true"]);
const DISABLE_VALUES = new Set(["off", "0", "false", "native"]);
const QUEST3_VALUES = new Set(["quest3", "quest-3"]);

export const resolveXrEmulatorRequest = (
  search: string,
  storedPreference: XrEmulatorPreference,
): XrEmulatorRequest => {
  const params = new URLSearchParams(search);
  const requested = (params.get("xr") ?? "").trim().toLowerCase();
  const stereo = requested === "stereo" || params.get("stereo") !== null;
  const headset: XrEmulatorHeadset = QUEST3_VALUES.has(requested) ? "quest3" : "quest2";

  if (stereo || headset === "quest3" || ENABLE_VALUES.has(requested)) {
    return { enabled: true, headset, persist: "enabled", stereo };
  }

  if (DISABLE_VALUES.has(requested)) {
    return { enabled: false, headset, persist: "disabled", stereo: false };
  }

  return {
    enabled: storedPreference === "enabled",
    headset,
    persist: "unset",
    stereo: false,
  };
};

const readPreference = (): XrEmulatorPreference => {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored === "enabled" || stored === "disabled") return stored;
  } catch {}
  return "unset";
};

const writePreference = (preference: XrEmulatorPreference): void => {
  if (preference === "unset") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, preference);
  } catch {}
};

const EMULATOR_AVAILABLE = import.meta.env.DEV || import.meta.env.VITE_XR_EMULATOR === "1";

const request: XrEmulatorRequest =
  !EMULATOR_AVAILABLE || typeof window === "undefined"
    ? { enabled: false, headset: "quest2", persist: "unset", stereo: false }
    : resolveXrEmulatorRequest(window.location.search, readPreference());

export const isXrEmulatorRequested = (): boolean => EMULATOR_AVAILABLE && request.enabled;

let state: XrEmulatorState = "off";

const repairOffsetReferenceSpaces = (referenceSpace: unknown): void => {
  const prototype = (referenceSpace as { prototype: Record<string, unknown> }).prototype;
  const spec = prototype.getOffsetReferenceSpace as (this: unknown, offset: unknown) => unknown;
  prototype.getOffsetReferenceSpace = function patched(this: unknown, offset: unknown) {
    const matrix = (offset as { matrix?: Float32Array } | null)?.matrix;
    return spec.call(this, matrix ?? offset);
  };
};

export const installXrEmulator = async (): Promise<XrEmulatorState> => {
  if (!EMULATOR_AVAILABLE || !request.enabled) return state;

  try {
    const [{ XRDevice, XRReferenceSpace, metaQuest2, metaQuest3 }, { DevUI }] = await Promise.all([
      import("iwer"),
      import("@iwer/devui"),
    ]);

    const device = new XRDevice(request.headset === "quest3" ? metaQuest3 : metaQuest2, {
      stereoEnabled: request.stereo,
    });
    device.installRuntime({ forceInstall: true });
    repairOffsetReferenceSpaces(XRReferenceSpace);
    device.installDevUI(DevUI);
    state = "installed";
  } catch {
    state = "failed";
  }

  return state;
};

if (EMULATOR_AVAILABLE && typeof window !== "undefined") {
  writePreference(request.persist);
}
