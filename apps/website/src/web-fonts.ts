import "@fontsource-variable/archivo/wdth.css";

const FACES = ["Archivo Variable"];

const ARRIVED = "exora:web-fonts-ready";

// A backgrounded tab never runs an animation frame, so the request cannot hang off one alone.
const HIDDEN_TAB_FALLBACK_MS = 200;

let arrived = false;
let requested = false;

const announce = (): void => {
  arrived = true;
  window.dispatchEvent(new Event(ARRIVED));
};

const request = (): void => {
  if (requested) return;
  requested = true;
  // The face ships with the bundle and is declared up front, but WebKit settles
  // `document.fonts.ready` before it has begun fetching it, so it is asked for by name.
  void Promise.all(FACES.map((face) => document.fonts.load(`1em "${face}"`))).then(
    announce,
    announce,
  );
};

/*
 * The typeface is asked for once the first frame is on screen, so the interface may be drawn
 * twice: once in the platform sans and again in Archivo. Anything whose layout was measured against
 * the first face has to hear about the second, and the FontFaceSet events that should say so are
 * not delivered by WebKit — so Exora announces the arrival itself.
 */
export const loadWebFonts = (): void => {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(request);
  });
  window.setTimeout(request, HIDDEN_TAB_FALLBACK_MS);
};

export const webFontsArrived = (): boolean => arrived;

export const onWebFontsReady = (listener: () => void): (() => void) => {
  window.addEventListener(ARRIVED, listener);
  return () => window.removeEventListener(ARRIVED, listener);
};
