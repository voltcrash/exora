import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { ApplicationErrorBoundary } from "./components/ApplicationErrorBoundary.tsx";
import { loadWebFonts } from "./web-fonts.ts";
import "./styles/tokens.css";
import "./styles/globals.css";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Exora could not find its application root.");

const render = (): void => {
  createRoot(root).render(
    <ApplicationErrorBoundary>
      <>
        <App />
        <Analytics />
        <SpeedInsights />
      </>
    </ApplicationErrorBoundary>,
  );
  loadWebFonts();
};

// Development keeps the network honest; a deployed build works offline after its first visit.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.warn("Exora could not install its offline cache.", error);
    });
  });
}

if (import.meta.env.DEV || import.meta.env.VITE_XR_EMULATOR === "1") {
  void import("./xr-emulator.ts").then(({ installXrEmulator, isXrEmulatorRequested }) => {
    if (isXrEmulatorRequested()) void installXrEmulator().then(render);
    else render();
  });
} else {
  render();
}
