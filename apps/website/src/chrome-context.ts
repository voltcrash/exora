import { createContext, useContext } from "react";

/*
 * What every destination's chrome can ask the application to do, provided once by `App` rather
 * than threaded through each experience as four more props. The defaults are inert so an
 * experience still renders on its own — in a test, or on a server.
 */
export interface ChromeActions {
  chromeHidden: boolean;
  openDiscover: () => void;
  openPalette: () => void;
  toggleChrome: () => void;
}

const inert = (): void => undefined;

export const ChromeContext = createContext<ChromeActions>({
  chromeHidden: false,
  openDiscover: inert,
  openPalette: inert,
  toggleChrome: inert,
});

export const useChrome = (): ChromeActions => useContext(ChromeContext);
