import type { ExoplanetProfile } from "@exora/contracts";
import { deriveWorldRecipe } from "@exora/worldgen";
import "./style.css";
import {
  loadFeaturedPlanet,
  loadPlanetByName,
  searchPlanets,
  type PlanetLoadResult,
} from "./api-client.ts";
import { createPlanetExperience, type PlanetExperience, type XrStatus } from "./planet-scene.ts";
import { featuredPlanet } from "./planet-profile.ts";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Exora could not find its application root.");

let activeExperience: PlanetExperience | null = null;
let activeFpsTimer: number | null = null;
let activeSearchController: AbortController | null = null;
let activeUiController: AbortController | null = null;
let searchDelay: number | null = null;
let renderVersion = 0;

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatNumber = (value: number | null, maximumFractionDigits = 1): string =>
  value === null ? "—" : new Intl.NumberFormat("en", { maximumFractionDigits }).format(value);

const formatPlanetName = (name: string): string => {
  const segments = name.split(" ");
  const suffix = segments.at(-1);

  return suffix && /^[a-z]$/i.test(suffix)
    ? `${escapeHtml(segments.slice(0, -1).join(" "))} <em>${escapeHtml(suffix)}</em>`
    : escapeHtml(name);
};

const archiveStateLabel = (result: PlanetLoadResult): string => {
  if (result.mode === "fallback") return "LOCAL ARCHIVE FALLBACK";
  return result.cached ? "NASA ARCHIVE · CACHED" : "NASA ARCHIVE · LIVE";
};

const planetKindLabel = (planet: ExoplanetProfile): string =>
  planet.kind.replace("-", " ").toUpperCase();

const hasRenderer = (planet: ExoplanetProfile): boolean =>
  planet.kind === "gas-giant" || planet.kind === "ice-giant" || planet.kind === "rocky";

const renderSearchResults = (planets: ExoplanetProfile[]): string => {
  if (planets.length === 0) {
    return `<li class="catalog-empty">No confirmed planets matched this signal.</li>`;
  }

  return planets
    .map((planet, index) => {
      const supported = hasRenderer(planet);
      const temperature =
        planet.observation.equilibriumTemperatureKelvin === null
          ? "TEMP UNKNOWN"
          : `${formatNumber(planet.observation.equilibriumTemperatureKelvin, 0)} K`;

      return `
        <li>
          <button
            class="catalog-result"
            type="button"
            data-result-index="${index}"
            ${supported ? "" : "disabled"}
          >
            <span class="result-marker" aria-hidden="true"></span>
            <span class="result-identity">
              <strong>${escapeHtml(planet.name)}</strong>
              <small>${escapeHtml(planet.hostStar)} · ${escapeHtml(planet.observation.discoveryMethod)}</small>
            </span>
            <span class="result-metrics">
              <small>${planetKindLabel(planet)}</small>
              <strong>${temperature}</strong>
            </span>
            <span class="result-state">${supported ? "EXPLORE" : "RENDERER PENDING"}</span>
          </button>
        </li>
      `;
    })
    .join("");
};

const renderShell = (result: PlanetLoadResult): void => {
  const planet = result.planet;
  const observation = planet.observation;
  const recipe = deriveWorldRecipe(planet);
  const massUnit = observation.massJupiter !== null ? "M<sub>J</sub>" : "M<sub>⊕</sub>";
  const massValue = observation.massJupiter ?? observation.massEarth;
  const radiusUnit = observation.radiusJupiter !== null ? "R<sub>J</sub>" : "R<sub>⊕</sub>";
  const radiusValue = observation.radiusJupiter ?? observation.radiusEarth;

  app.innerHTML = `
    <div class="experience-shell">
      <canvas id="render-canvas" aria-label="Interactive visualization of ${escapeHtml(planet.name)}" tabindex="0"></canvas>
      <div class="space-haze" aria-hidden="true"></div>
      <div class="viewport-grid" aria-hidden="true"></div>

      <header class="topbar">
        <a class="brand" href="/" aria-label="Exora home">
          <span class="brand-mark" aria-hidden="true"></span>
          <span>EXORA</span>
        </a>
        <button id="open-catalog" class="catalog-trigger" type="button">
          <span class="catalog-radar" aria-hidden="true"></span>
          <span><small>WORLD CATALOG</small><strong>FIND A PLANET</strong></span>
          <kbd>/</kbd>
        </button>
        <div class="archive-state">
          <span class="pulse-dot" aria-hidden="true"></span>
          ${archiveStateLabel(result)}
        </div>
      </header>

      <main class="hud">
        <section class="world-intro" aria-labelledby="world-name">
          <p class="eyebrow"><span>CONFIRMED EXOPLANET</span><span>ACTIVE WORLD</span></p>
          <h1 id="world-name">${formatPlanetName(planet.name)}</h1>
          <div class="world-tags" aria-label="World classification">
            <span>${recipe.classification}</span>
            <span>${observation.equilibriumTemperatureKelvin === null ? "TEMP UNKNOWN" : `${formatNumber(observation.equilibriumTemperatureKelvin, 0)} K`}</span>
            <span>${escapeHtml(observation.discoveryMethod)}</span>
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
            <div><dt>Mass</dt><dd>${formatNumber(massValue)} <small>${massUnit}</small></dd></div>
            <div><dt>Radius</dt><dd>${formatNumber(radiusValue)} <small>${radiusUnit}</small></dd></div>
            <div><dt>Orbit</dt><dd>${formatNumber(observation.semiMajorAxisAu, 1)} <small>AU</small></dd></div>
            <div><dt>Distance</dt><dd>${formatNumber(observation.distanceParsecs, 0)} <small>PC</small></dd></div>
          </dl>
          <div class="telemetry-detail">
            <span>HOST STAR</span>
            <strong>${escapeHtml(planet.hostStar)}</strong>
            <small>${escapeHtml(observation.hostSpectralType ?? "Spectrum unavailable")}</small>
          </div>
          <div class="telemetry-detail">
            <span>ATMOSPHERE MODEL</span>
            <strong>${recipe.atmosphere.label.split(" · ")[0]}</strong>
            <small>Exora inference · ${recipe.confidence} confidence</small>
          </div>
          <p class="source-note">${planet.source.archive} · ${planet.source.table} · ${planet.source.retrievedOn}</p>
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

      <dialog id="planet-catalog" class="planet-catalog" aria-labelledby="catalog-title">
        <form method="dialog" class="catalog-header">
          <div>
            <p>NASA EXOPLANET ARCHIVE</p>
            <h2 id="catalog-title">Choose another world</h2>
          </div>
          <button class="catalog-close" value="close" aria-label="Close planet catalog">×</button>
        </form>
        <div class="catalog-search">
          <span class="search-reticle" aria-hidden="true"></span>
          <input
            id="planet-query"
            type="search"
            placeholder="Search by planet name — try WASP, Kepler, or HD 209458"
            autocomplete="off"
            minlength="2"
            aria-describedby="catalog-status"
          />
          <span class="search-key">ESC</span>
        </div>
        <div class="catalog-meta">
          <p id="catalog-status" role="status">Enter at least two characters to scan the archive.</p>
          <span>Gas, ice, and rocky worlds available · unclassified worlds pending</span>
        </div>
        <ol id="catalog-results" class="catalog-results"></ol>
      </dialog>

      <div class="loading-screen" role="status">
        <div class="loading-orbit" aria-hidden="true"><span></span></div>
        <p>CALCULATING WORLD</p>
        <small>${escapeHtml(planet.name.toUpperCase())} · SEED ${recipe.seed.toString(16).toUpperCase()}</small>
      </div>
    </div>
  `;
};

const clearActiveExperience = (): void => {
  activeUiController?.abort();
  activeUiController = null;
  activeSearchController?.abort();
  activeSearchController = null;

  if (searchDelay !== null) window.clearTimeout(searchDelay);
  searchDelay = null;

  if (activeFpsTimer !== null) window.clearInterval(activeFpsTimer);
  activeFpsTimer = null;

  activeExperience?.dispose();
  activeExperience = null;
};

const setXrStatus = (status: XrStatus): void => {
  const enterVrButton = document.querySelector<HTMLButtonElement>("#enter-vr");
  const enterVrLabel = enterVrButton?.querySelector<HTMLElement>("strong");
  const xrStatusLabel = document.querySelector<HTMLElement>("#xr-status");
  if (!enterVrButton || !enterVrLabel || !xrStatusLabel) return;

  document.body.dataset.xrStatus = status;
  const copy: Record<XrStatus, { button: string; label: string }> = {
    checking: { button: "CHECKING HEADSET", label: "CHECKING WEBXR" },
    entering: { button: "ENTERING SESSION", label: "OPENING IMMERSIVE VR" },
    "in-xr": { button: "SESSION ACTIVE", label: "IMMERSIVE VR ACTIVE" },
    ready: { button: "ENTER IMMERSIVE VR", label: "WEBXR READY" },
    unavailable: { button: "VR UNAVAILABLE", label: "DESKTOP EXPLORATION" },
  };

  enterVrLabel.textContent = copy[status].button;
  xrStatusLabel.textContent = copy[status].label;
  enterVrButton.disabled = status !== "ready";
};

const bindCatalog = (): void => {
  const dialog = document.querySelector<HTMLDialogElement>("#planet-catalog");
  const openButton = document.querySelector<HTMLButtonElement>("#open-catalog");
  const queryInput = document.querySelector<HTMLInputElement>("#planet-query");
  const status = document.querySelector<HTMLElement>("#catalog-status");
  const resultsElement = document.querySelector<HTMLOListElement>("#catalog-results");
  if (!dialog || !openButton || !queryInput || !status || !resultsElement) return;

  let searchResults: ExoplanetProfile[] = [];
  let searchWasCached = false;
  const uiController = new AbortController();
  activeUiController = uiController;
  const eventOptions = { signal: uiController.signal };

  const openCatalog = (): void => {
    if (!dialog.open) dialog.showModal();
    window.setTimeout(() => queryInput.focus(), 0);
  };

  openButton.addEventListener("click", openCatalog, eventOptions);
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "/" && !dialog.open) {
        event.preventDefault();
        openCatalog();
      }
    },
    eventOptions,
  );

  dialog.addEventListener(
    "click",
    (event) => {
      if (event.target === dialog) dialog.close();
    },
    eventOptions,
  );

  queryInput.addEventListener(
    "input",
    () => {
      if (searchDelay !== null) window.clearTimeout(searchDelay);
      activeSearchController?.abort();

      const query = queryInput.value.trim();
      if (query.length < 2) {
        status.textContent = "Enter at least two characters to scan the archive.";
        resultsElement.innerHTML = "";
        return;
      }

      status.textContent = `Scanning NASA archive for “${query}”…`;
      resultsElement.innerHTML = `<li class="catalog-loading"><span></span> Resolving confirmed worlds</li>`;

      searchDelay = window.setTimeout(() => {
        const controller = new AbortController();
        activeSearchController = controller;

        void searchPlanets(query, { signal: controller.signal })
          .then((result) => {
            if (controller.signal.aborted) return;
            searchResults = result.planets;
            searchWasCached = result.cached;
            status.textContent = `${result.planets.length} confirmed ${result.planets.length === 1 ? "world" : "worlds"} found${result.cached ? " · cached result" : ""}.`;
            resultsElement.innerHTML = renderSearchResults(result.planets);
          })
          .catch((error: unknown) => {
            if (controller.signal.aborted) return;
            console.error(error);
            searchResults = [];
            status.textContent = "The archive signal is unavailable. Try again shortly.";
            resultsElement.innerHTML = `<li class="catalog-empty">NASA search could not be completed.</li>`;
          });
      }, 320);
    },
    eventOptions,
  );

  resultsElement.addEventListener(
    "click",
    (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-result-index]",
      );
      if (!button || button.disabled) return;

      const planet = searchResults[Number(button.dataset.resultIndex)];
      if (!planet || !hasRenderer(planet)) return;

      dialog.close();
      const nextResult: PlanetLoadResult = {
        cached: searchWasCached,
        mode: "live",
        planet,
      };
      window.history.pushState({}, "", `?planet=${encodeURIComponent(planet.name)}`);
      void activatePlanet(nextResult);
    },
    eventOptions,
  );
};

const activatePlanet = async (result: PlanetLoadResult): Promise<void> => {
  const currentVersion = ++renderVersion;
  clearActiveExperience();
  document.body.classList.remove("scene-ready", "scene-error");
  renderShell(result);
  bindCatalog();

  const canvas = document.querySelector<HTMLCanvasElement>("#render-canvas");
  const enterVrButton = document.querySelector<HTMLButtonElement>("#enter-vr");
  const fpsLabel = document.querySelector<HTMLElement>("#fps");
  const xrStatusLabel = document.querySelector<HTMLElement>("#xr-status");
  if (!canvas || !enterVrButton || !fpsLabel || !xrStatusLabel) return;

  try {
    const experience = await createPlanetExperience({
      canvas,
      recipe: deriveWorldRecipe(result.planet),
      onXrStatusChange: setXrStatus,
      onFirstFrame: () => {
        if (currentVersion === renderVersion) document.body.classList.add("scene-ready");
      },
    });

    if (currentVersion !== renderVersion) {
      experience.dispose();
      return;
    }

    activeExperience = experience;
    activeFpsTimer = window.setInterval(() => {
      fpsLabel.textContent = Math.round(experience.getFps()).toString();
    }, 1_000);

    enterVrButton.addEventListener("click", () => {
      void experience.enterVr().catch(() => setXrStatus("ready"));
    });
  } catch (error) {
    console.error(error);
    document.body.classList.add("scene-ready", "scene-error");
    xrStatusLabel.textContent = "RENDERER UNAVAILABLE";
  }
};

const requestedPlanetName = new URLSearchParams(window.location.search).get("planet");
const requestedPlanet = requestedPlanetName ? await loadPlanetByName(requestedPlanetName) : null;
const initialPlanet =
  requestedPlanet && hasRenderer(requestedPlanet.planet)
    ? requestedPlanet
    : await loadFeaturedPlanet(featuredPlanet);

await activatePlanet(initialPlanet);

window.addEventListener("popstate", () => window.location.reload());
window.addEventListener("beforeunload", clearActiveExperience, { once: true });
