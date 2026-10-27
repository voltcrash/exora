import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { preloadPlanetCatalog } from "./api-client.ts";
import { ApplicationErrorBoundary } from "./components/ApplicationErrorBoundary.tsx";
import { DeferredTelemetry } from "./components/DeferredTelemetry.tsx";
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
        <DeferredTelemetry />
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

// Fetch the planet catalog once the page and the browser are idle, unless data is precious.
window.addEventListener(
  "load",
  () => {
    const { connection } = navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean };
    };
    if (connection?.saveData || connection?.effectiveType?.endsWith("2g")) return;
    const prefetch = (): void => void preloadPlanetCatalog();
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(prefetch, { timeout: 10_000 });
    } else window.setTimeout(prefetch, 5_000);
  },
  { once: true },
);

render();
