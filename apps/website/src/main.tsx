import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { ApplicationErrorBoundary } from "./components/ApplicationErrorBoundary.tsx";
import "./styles/tokens.css";
import "./styles/globals.css";

const WEB_FONT_STYLESHEET =
  "https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Exora could not find its application root.");

const scheduleWebFontLoad = (): void => {
  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      if (document.head.querySelector('link[data-exora-fonts="true"]')) return;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = WEB_FONT_STYLESHEET;
      link.dataset.exoraFonts = "true";
      document.head.append(link);
    }, 1_000);
  });
};

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
  scheduleWebFontLoad();
};

if (import.meta.env.DEV || import.meta.env.VITE_XR_EMULATOR === "1") {
  void import("./xr-emulator.ts").then(({ installXrEmulator, isXrEmulatorRequested }) => {
    if (isXrEmulatorRequested()) void installXrEmulator().then(render);
    else render();
  });
} else {
  render();
}
