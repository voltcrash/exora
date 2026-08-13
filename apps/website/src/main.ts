import "./style.css";
import { createPlanetExperience, type XrStatus } from "./planet-scene.ts";
import { featuredPlanet } from "./planet-profile.ts";
import { deriveWorldRecipe } from "./world-recipe.ts";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) throw new Error("Exora could not find its application root.");

const observation = featuredPlanet.observation;
const recipe = deriveWorldRecipe(featuredPlanet);

const formatNumber = (value: number, maximumFractionDigits = 1): string =>
  new Intl.NumberFormat("en", { maximumFractionDigits }).format(value);

app.innerHTML = `
  <div class="experience-shell">
    <canvas id="render-canvas" aria-label="Interactive visualization of ${featuredPlanet.name}" tabindex="0"></canvas>
    <div class="space-haze" aria-hidden="true"></div>
    <div class="viewport-grid" aria-hidden="true"></div>

    <header class="topbar">
      <a class="brand" href="/" aria-label="Exora home">
        <span class="brand-mark" aria-hidden="true"></span>
        <span>EXORA</span>
      </a>
      <div class="mission-id">
        <span>WORLD SYNTHESIS</span>
        <strong>EX–001</strong>
      </div>
      <div class="archive-state">
        <span class="pulse-dot" aria-hidden="true"></span>
        NASA ARCHIVE FIXTURE
      </div>
    </header>

    <main class="hud">
      <section class="world-intro" aria-labelledby="world-name">
        <p class="eyebrow"><span>CONFIRMED EXOPLANET</span><span>01 / 01</span></p>
        <h1 id="world-name">HIP 65426 <em>b</em></h1>
        <div class="world-tags" aria-label="World classification">
          <span>${recipe.classification}</span>
          <span>${formatNumber(observation.equilibriumTemperatureKelvin, 0)} K</span>
          <span>${observation.discoveryMethod}</span>
        </div>
        <p class="world-summary">${recipe.summary}</p>
        <p class="visual-note"><span aria-hidden="true">◈</span> Visual synthesis — not observed imagery</p>
      </section>

      <aside class="telemetry" aria-label="Observed planet data">
        <div class="telemetry-heading">
          <span>OBSERVED SIGNAL</span>
          <span class="signal-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        </div>
        <dl>
          <div>
            <dt>Mass</dt>
            <dd>${formatNumber(observation.massJupiter)} <small>M<sub>J</sub></small></dd>
          </div>
          <div>
            <dt>Radius</dt>
            <dd>${formatNumber(observation.radiusJupiter)} <small>R<sub>J</sub></small></dd>
          </div>
          <div>
            <dt>Orbit</dt>
            <dd>${formatNumber(observation.semiMajorAxisAu ?? 0, 0)} <small>AU</small></dd>
          </div>
          <div>
            <dt>Distance</dt>
            <dd>${formatNumber(observation.distanceParsecs, 0)} <small>PC</small></dd>
          </div>
        </dl>
        <div class="telemetry-detail">
          <span>HOST STAR</span>
          <strong>${featuredPlanet.hostStar}</strong>
          <small>${observation.hostSpectralType ?? "Spectrum unavailable"}</small>
        </div>
        <div class="telemetry-detail">
          <span>ATMOSPHERE MODEL</span>
          <strong>${recipe.atmosphere.label.split(" · ")[0]}</strong>
          <small>Exora inference · ${recipe.confidence} confidence</small>
        </div>
        <p class="source-note">${featuredPlanet.source.archive} · ${featuredPlanet.source.table}</p>
      </aside>
    </main>

    <footer class="mission-control">
      <div class="system-status" aria-live="polite">
        <span class="status-light" aria-hidden="true"></span>
        <span><small>EXPLORATION MODE</small><strong id="xr-status">INITIALIZING SCENE</strong></span>
      </div>
      <div class="interaction-hint" aria-label="Desktop controls">
        <span><kbd>DRAG</kbd> ORBIT</span>
        <span><kbd>SCROLL</kbd> RANGE</span>
        <span><strong id="fps">--</strong> FPS</span>
      </div>
      <button id="enter-vr" class="enter-vr" type="button" disabled>
        <span class="button-orbit" aria-hidden="true"></span>
        <span><small>QUEST / WEBXR</small><strong>CHECKING HEADSET</strong></span>
        <span class="button-arrow" aria-hidden="true">↗</span>
      </button>
    </footer>

    <div class="loading-screen" role="status">
      <div class="loading-orbit" aria-hidden="true"><span></span></div>
      <p>CALCULATING WORLD</p>
      <small>${featuredPlanet.name.toUpperCase()} · SEED ${recipe.seed.toString(16).toUpperCase()}</small>
    </div>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#render-canvas");
const enterVrButton = document.querySelector<HTMLButtonElement>("#enter-vr");
const enterVrLabel = enterVrButton?.querySelector<HTMLElement>("strong");
const fpsLabel = document.querySelector<HTMLElement>("#fps");
const xrStatusLabel = document.querySelector<HTMLElement>("#xr-status");

if (!canvas || !enterVrButton || !enterVrLabel || !fpsLabel || !xrStatusLabel) {
  throw new Error("Exora interface controls could not be initialized.");
}

const setXrStatus = (status: XrStatus): void => {
  document.body.dataset.xrStatus = status;

  const statusCopy: Record<XrStatus, { button: string; label: string }> = {
    checking: { button: "CHECKING HEADSET", label: "CHECKING WEBXR" },
    entering: { button: "ENTERING SESSION", label: "OPENING IMMERSIVE VR" },
    "in-xr": { button: "SESSION ACTIVE", label: "IMMERSIVE VR ACTIVE" },
    ready: { button: "ENTER IMMERSIVE VR", label: "WEBXR READY" },
    unavailable: { button: "VR UNAVAILABLE", label: "DESKTOP EXPLORATION" },
  };

  enterVrLabel.textContent = statusCopy[status].button;
  xrStatusLabel.textContent = statusCopy[status].label;
  enterVrButton.disabled = status !== "ready";
};

try {
  const experience = await createPlanetExperience({
    canvas,
    recipe,
    onXrStatusChange: setXrStatus,
    onFirstFrame: () => document.body.classList.add("scene-ready"),
  });

  const fpsTimer = window.setInterval(() => {
    fpsLabel.textContent = Math.round(experience.getFps()).toString();
  }, 1_000);

  enterVrButton.addEventListener("click", () => {
    void experience.enterVr().catch(() => setXrStatus("ready"));
  });

  window.addEventListener(
    "beforeunload",
    () => {
      window.clearInterval(fpsTimer);
      experience.dispose();
    },
    { once: true },
  );
} catch (error) {
  console.error(error);
  document.body.classList.add("scene-ready", "scene-error");
  xrStatusLabel.textContent = "RENDERER UNAVAILABLE";
}
