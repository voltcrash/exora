import { useEffect, useState } from "react";

import { onWebFontsReady, webFontsArrived } from "./web-fonts.ts";

/*
 * The faces are only asked for a second after the first paint, so a scene that finishes sooner
 * would uncover itself while the loading copy is still drawn in the platform sans. The cap keeps a
 * refused or slow font fetch from stranding the loading screen.
 */
const TYPEFACE_WAIT_CAP_MS = 3_000;

export const useTypographySettled = (): boolean => {
  const [settled, setSettled] = useState(webFontsArrived);

  useEffect(() => {
    if (settled) return;
    const stopListening = onWebFontsReady(() => setSettled(true));
    const cap = window.setTimeout(() => setSettled(true), TYPEFACE_WAIT_CAP_MS);
    return () => {
      stopListening();
      window.clearTimeout(cap);
    };
  }, [settled]);

  return settled;
};
