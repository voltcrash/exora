import "@fontsource-variable/ibm-plex-sans/wght.css";
import "@fontsource-variable/geist-mono/wght.css";

const FACES = ["IBM Plex Sans Variable", "Geist Mono Variable"];

const ARRIVED = "exora:web-fonts-ready";

// A backgrounded tab never runs an animation frame, so the request cannot hang off one alone.
const HIDDEN_TAB_FALLBACK_MS = 200;

let state: "idle" | "loading" | "loaded" | "failed" = "idle";

const announce = (next: "loaded" | "failed"): void => {
  state = next;
  window.dispatchEvent(new Event(ARRIVED));
};

const request = (): void => {
  if (state !== "idle") return;
  state = "loading";
  // The faces ship with the bundle and are declared up front, but WebKit settles
  // `document.fonts.ready` before it has begun fetching them, so they are asked for by name.
  void Promise.all(FACES.map((face) => document.fonts.load(`1em "${face}"`))).then(
    () => announce("loaded"),
    () => announce("failed"),
  );
};

/*
 * The typeface is asked for once the first frame is on screen, so the interface may be drawn
 * twice: once in the platform sans and again in the web font. Anything whose layout was measured against
 * the first face has to hear about the second, and the FontFaceSet events that should say so are
 * not delivered by WebKit — so Exora announces the arrival itself.
 */
export const loadWebFonts = (): void => {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(request);
  });
  window.setTimeout(request, HIDDEN_TAB_FALLBACK_MS);
};

export const webFontsSettled = (): boolean => state === "loaded" || state === "failed";

export const onWebFontsSettled = (listener: () => void): (() => void) => {
  window.addEventListener(ARRIVED, listener);
  if (webFontsSettled()) listener();
  return () => window.removeEventListener(ARRIVED, listener);
};
