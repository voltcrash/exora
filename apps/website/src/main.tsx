import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { ApplicationErrorBoundary } from "./components/ApplicationErrorBoundary.tsx";
import { installXrEmulator, isXrEmulatorRequested } from "./xr-emulator.ts";
import "./style.css";

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
};

// The emulated runtime has to own navigator.xr before Babylon probes for a headset.
if (isXrEmulatorRequested()) {
  void installXrEmulator().then(render);
} else {
  render();
}
