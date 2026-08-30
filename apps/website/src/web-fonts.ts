const STYLESHEET =
  "https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap";

const FACES = ["Exo 2", "IBM Plex Mono"];

const ARRIVED = "exora:web-fonts-ready";

// A backgrounded tab never runs an animation frame, so the request cannot hang off one alone.
const HIDDEN_TAB_FALLBACK_MS = 200;

let arrived = false;

const announce = (): void => {
  arrived = true;
  window.dispatchEvent(new Event(ARRIVED));
};

const request = (): void => {
  if (document.head.querySelector('link[data-exora-fonts="true"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLESHEET;
  link.dataset.exoraFonts = "true";
  link.addEventListener("load", () => {
    // The stylesheet only declares the faces. WebKit settles `document.fonts.ready` before it has
    // begun fetching them, so the faces are asked for by name and waited on individually.
    void Promise.all(FACES.map((face) => document.fonts.load(`1em "${face}"`))).then(
      announce,
      announce,
    );
  });
  link.addEventListener("error", announce);
  document.head.append(link);
};

/*
 * The typefaces are asked for as soon as the first frame is on screen, so the interface is drawn
 * twice: once in whatever sans the platform supplies, and again in Exo 2. Anything whose layout was
 * measured against the first face has to hear about the second, and the FontFaceSet events that
 * should say so are not delivered by WebKit — so the load Exora itself schedules announces its own
 * arrival.
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
