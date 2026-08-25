/**
 * Emulated WebXR runtime for desktop debugging.
 *
 * A regular browser reports no `immersive-vr` device, so the immersive flow can only be
 * exercised on a headset. Opting in to the Immersive Web Emulation Runtime installs a
 * synthetic Quest device on `navigator.xr` plus an on-screen rig for moving the headset
 * and controllers, which lets the same code path run in a normal tab.
 */

export type XrEmulatorPreference = "enabled" | "disabled" | "unset";
export type XrEmulatorState = "off" | "installed" | "failed";

export type XrEmulatorHeadset = "quest2" | "quest3";

export interface XrEmulatorRequest {
  /** Whether the emulated runtime should be installed on this load. */
  enabled: boolean;
  /** Which headset the synthetic device reports, and so which render tier is exercised. */
  headset: XrEmulatorHeadset;
  /** Preference to persist for later navigations, when the request changed it. */
  persist: XrEmulatorPreference;
  /** Render both eyes side by side instead of a single flat view. */
  stereo: boolean;
}

const STORAGE_KEY = "exora:xr-emulator";
const ENABLE_VALUES = new Set(["emulate", "emulated", "on", "1", "true"]);
const DISABLE_VALUES = new Set(["off", "0", "false", "native"]);
const QUEST3_VALUES = new Set(["quest3", "quest-3"]);

/** Builds emulator intent from the URL and the previously stored preference. */
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
  } catch {
    // Private browsing modes can reject storage access; fall back to URL-only control.
  }
  return "unset";
};

const writePreference = (preference: XrEmulatorPreference): void => {
  if (preference === "unset") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Persisting the preference is a convenience, not a requirement.
  }
};

/**
 * Emulation is available on the dev server, and in builds made with VITE_XR_EMULATOR=1.
 * Both operands fold to literals at build time, so production bundles drop the runtime
 * and its dev UI entirely.
 */
const EMULATOR_AVAILABLE = import.meta.env.DEV || import.meta.env.VITE_XR_EMULATOR === "1";

const request: XrEmulatorRequest =
  !EMULATOR_AVAILABLE || typeof window === "undefined"
    ? { enabled: false, headset: "quest2", persist: "unset", stereo: false }
    : resolveXrEmulatorRequest(window.location.search, readPreference());

/** True when this load should install the emulated runtime before the scene boots. */
export const isXrEmulatorRequested = (): boolean => EMULATOR_AVAILABLE && request.enabled;

let state: XrEmulatorState = "off";

/**
 * Teaches the emulated runtime the spec signature of `getOffsetReferenceSpace`.
 *
 * The WebXR specification passes an `XRRigidTransform`; IWER declares and consumes a raw
 * `mat4` and clones whatever it is handed straight into the new space's offset matrix. Handed
 * a conforming transform it therefore reads sixteen `undefined`s and produces an all-NaN
 * offset, which silently discards the move.
 *
 * That matters more here than the size of the bug suggests. Repositioning the wearer is done
 * by writing the XR camera's position, and Babylon turns exactly that write into an offset
 * reference space — so without this, every scene's `focusXrRig` is a no-op under emulation and
 * the wearer stands at the tracking origin in every destination. The one thing the emulator
 * exists to rehearse is the thing that stops working.
 */
const repairOffsetReferenceSpaces = (referenceSpace: unknown): void => {
  const prototype = (referenceSpace as { prototype: Record<string, unknown> }).prototype;
  const spec = prototype.getOffsetReferenceSpace as (this: unknown, offset: unknown) => unknown;
  prototype.getOffsetReferenceSpace = function patched(this: unknown, offset: unknown) {
    const matrix = (offset as { matrix?: Float32Array } | null)?.matrix;
    return spec.call(this, matrix ?? offset);
  };
};

/**
 * Installs the emulated runtime. Must resolve before Babylon inspects `navigator.xr`,
 * so callers await it ahead of the first render.
 */
export const installXrEmulator = async (): Promise<XrEmulatorState> => {
  if (!EMULATOR_AVAILABLE || !request.enabled) return state;

  try {
    const [{ XRDevice, XRReferenceSpace, metaQuest2, metaQuest3 }, { DevUI }] = await Promise.all([
      import("iwer"),
      import("@iwer/devui"),
    ]);

    // Exora targets Quest 2, and `deriveRenderQuality` reads the headset out of the user agent.
    // Emulating a Quest 3 by default would therefore exercise the wrong rendering budget in the
    // one place the budget is the whole point, so the weaker headset is what a plain
    // `?xr=emulate` installs.
    const device = new XRDevice(request.headset === "quest3" ? metaQuest3 : metaQuest2, {
      stereoEnabled: request.stereo,
    });
    // A desktop browser exposes a `navigator.xr` with no connected device, so the
    // emulated runtime has to replace it rather than defer to it.
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
