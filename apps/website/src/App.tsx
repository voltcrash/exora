import { defaultPlanetObject, solarPlanetObject, type ActiveObject } from "./active-destination.ts";
import { createOperationGate } from "./operation-gate.ts";
import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import type { CustomBlackHole, CustomStar, CustomWorld } from "@exora/worldgen";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { reachStar, reachSystem } from "./destination-cache.ts";
import { PlanetExperience } from "./components/PlanetExperience.tsx";
import { OfflineNotice } from "./components/OfflineNotice.tsx";
import { RecoveryScreen } from "./components/RecoveryScreen.tsx";
import { canonicalUrlForSearch } from "./canonical-url.ts";
import { descriptionFor, documentTitleFor } from "./document-title.ts";
import type { BlackHoleProfile } from "./black-holes.ts";
import { togglesClearView } from "./clear-view-shortcut.ts";
import { opensCommandPalette, type PaletteTarget } from "./command-palette.ts";
import { togglesDiscoverShortcut } from "./discover-shortcut.ts";
import type { ActiveTour } from "./tours.ts";
import { TRAVEL_CROSS_MS, TRAVEL_REVEAL_MS, type TravelPhase } from "./travel-transition.ts";
import { useSceneHost } from "./use-scene-host.ts";
import type { SolarRegionProfile } from "./solar-regions.ts";
import { ChromeContext, type ChromeActions } from "./chrome-context.ts";
import { LoadingScreen } from "./components/shell/LoadingScreen.tsx";
import shellStyles from "./components/shell/shell.module.css";
import { bindStyles } from "./styles/bind-styles.ts";

const cx = bindStyles(shellStyles);

const TourBar = lazy(() =>
  import("./components/TourBar.tsx").then((module) => ({ default: module.TourBar })),
);

const DiscoverScreen = lazy(() =>
  import("./components/DiscoverScreen.tsx").then((module) => ({ default: module.DiscoverScreen })),
);
const CommandPalette = lazy(() =>
  import("./components/CommandPalette.tsx").then((module) => ({
    default: module.CommandPalette,
  })),
);
const StarExperience = lazy(() =>
  import("./components/StarExperience.tsx").then((module) => ({ default: module.StarExperience })),
);
const SystemExperience = lazy(() =>
  import("./components/SystemExperience.tsx").then((module) => ({
    default: module.SystemExperience,
  })),
);
const RegionExperience = lazy(() =>
  import("./components/RegionExperience.tsx").then((module) => ({
    default: module.RegionExperience,
  })),
);
const BlackHoleExperience = lazy(() =>
  import("./components/BlackHoleExperience.tsx").then((module) => ({
    default: module.BlackHoleExperience,
  })),
);
const loadRequestedObject = (): Promise<ActiveObject> =>
  import("./requested-destination.ts").then((module) => module.loadRequestedObject());

export const App = () => {
  const navigation = useRef(createOperationGate()).current;
  const [resolving, setResolving] = useState(false);
  const navigationFailed = useCallback(() => {
    setResolving(false);
    setActiveObject({
      type: "missing",
      kind: "planet",
      name: "requested destination",
      retry: true,
      detail: "The destination could not be loaded. Check your connection and retry.",
    });
  }, []);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const {
    host: sceneHost,
    restart: restartSceneHost,
    status: sceneHostStatus,
  } = useSceneHost(canvas);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activeObject, setActiveObject] = useState<ActiveObject | null>(() => {
    const parameters = new URLSearchParams(window.location.search);
    return parameters.has("blackHole") ||
      parameters.has("customBlackHole") ||
      parameters.has("region") ||
      parameters.has("planet") ||
      parameters.has("star") ||
      parameters.has("system") ||
      parameters.has("custom") ||
      parameters.has("customStar")
      ? null
      : defaultPlanetObject();
  });
  const [systemHostName, setSystemHostName] = useState<string | null>(null);

  const [chromeHidden, setChromeHidden] = useState(false);

  const [travelPhase, setTravelPhase] = useState<TravelPhase>("idle");
  useEffect(() => sceneHost?.onTravelPhase(setTravelPhase), [sceneHost]);

  const overlayOpen = discoverOpen || paletteOpen;
  useEffect(() => {
    if (!sceneHost || !overlayOpen || sceneHost.isInXr()) return;
    return sceneHost.suspendRendering();
  }, [overlayOpen, sceneHost]);

  const onMainScreen =
    !overlayOpen &&
    activeObject !== null &&
    activeObject.type !== "missing" &&
    (sceneHostStatus === "initializing" || sceneHostStatus === "ready");

  const loadFromLocation = useCallback(() => {
    const current = navigation.start();
    setResolving(true);
    setSystemHostName(null);
    void loadRequestedObject()
      .then((next) => {
        if (!current()) return;
        setActiveObject(next);
        setResolving(false);
      })
      .catch(() => {
        if (current()) navigationFailed();
      });
  }, [navigation, navigationFailed]);

  useEffect(() => {
    if (window.location.search) loadFromLocation();
    window.addEventListener("popstate", loadFromLocation);
    return () => {
      navigation.cancel();
      window.removeEventListener("popstate", loadFromLocation);
    };
  }, [loadFromLocation, navigation]);

  useEffect(() => {
    const toggleDiscoverWithShortcut = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        !togglesDiscoverShortcut({
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          key: event.key,
          metaKey: event.metaKey,
          repeat: event.repeat,
          shiftKey: event.shiftKey,
          target: target instanceof HTMLElement ? target : null,
        })
      ) {
        return;
      }
      if (!discoverOpen && !onMainScreen) return;

      event.preventDefault();
      if (discoverOpen) {
        setDiscoverOpen(false);
        return;
      }
      setDiscoverOpen(true);
    };

    document.addEventListener("keydown", toggleDiscoverWithShortcut);
    return () => document.removeEventListener("keydown", toggleDiscoverWithShortcut);
  }, [discoverOpen, onMainScreen]);

  useEffect(() => {
    const togglePalette = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        !opensCommandPalette({
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          key: event.key,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          target: target instanceof HTMLElement ? target : null,
        })
      ) {
        return;
      }
      event.preventDefault();
      setDiscoverOpen(false);
      setPaletteOpen((open) => !open);
    };

    document.addEventListener("keydown", togglePalette);
    return () => document.removeEventListener("keydown", togglePalette);
  }, []);

  useEffect(() => {
    const toggleChrome = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        !togglesClearView({
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          key: event.key,
          metaKey: event.metaKey,
          onMainScreen,
          shiftKey: event.shiftKey,
          target: target instanceof HTMLElement ? target : null,
        })
      ) {
        return;
      }

      event.preventDefault();
      setChromeHidden((hidden) => !hidden);
    };

    document.addEventListener("keydown", toggleChrome);
    return () => document.removeEventListener("keydown", toggleChrome);
  }, [onMainScreen]);

  useEffect(() => {
    const canonical = canonicalUrlForSearch(window.location.search);
    document
      .querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?.setAttribute("href", canonical);
    document
      .querySelector<HTMLMetaElement>('meta[property="og:url"]')
      ?.setAttribute("content", canonical);
  }, [activeObject]);

  const selectPlanet = useCallback(
    (planet: ExoplanetProfile, cached: boolean): void => {
      const current = navigation.start();
      setResolving(false);
      window.history.pushState({}, "", `?planet=${encodeURIComponent(planet.name)}`);
      setDiscoverOpen(false);
      if (planet.solarSystem) {
        void solarPlanetObject(planet, cached)
          .then((next) => {
            if (current()) setActiveObject(next);
          })
          .catch(() => {
            if (current()) navigationFailed();
          });
        return;
      }
      setActiveObject({
        result: { cached, mode: "live", planet },
        type: "planet",
      });
    },
    [navigation, navigationFailed],
  );

  const selectStar = useCallback(
    (star: StarProfile, cached: boolean): void => {
      navigation.cancel();
      setResolving(false);
      window.history.pushState({}, "", `?star=${encodeURIComponent(star.name)}`);
      setDiscoverOpen(false);
      setSystemHostName(null);
      setActiveObject({
        result: { cached, mode: star.solarSystem ? "solar" : "live", star },
        type: "star",
      });
    },
    [navigation, navigationFailed],
  );

  const selectBlackHole = useCallback(
    (blackHole: BlackHoleProfile): void => {
      navigation.cancel();
      setResolving(false);
      const identity = blackHole.provenance === "procedural" ? blackHole.id : blackHole.name;
      window.history.pushState({}, "", `?blackHole=${encodeURIComponent(identity)}`);
      setDiscoverOpen(false);
      setSystemHostName(null);
      setActiveObject({ blackHole, type: "black-hole" });
    },
    [navigation, navigationFailed],
  );

  const selectRegion = useCallback(
    (region: SolarRegionProfile): void => {
      navigation.cancel();
      setResolving(false);
      window.history.pushState({}, "", `?region=${encodeURIComponent(region.name)}`);
      setDiscoverOpen(false);
      setSystemHostName(null);
      setActiveObject({ region, type: "region" });
    },
    [navigation, navigationFailed],
  );

  const selectSystem = useCallback(
    async (hostStar: string): Promise<boolean> => {
      const current = navigation.start();
      setResolving(true);
      const system = await reachSystem(hostStar).catch(() => null);
      if (!current()) return true;
      setResolving(false);
      if (!system) return false;
      window.history.pushState({}, "", `?system=${encodeURIComponent(hostStar)}`);
      setSystemHostName(hostStar);
      setActiveObject({ result: system, type: "system" });
      return true;
    },
    [navigation, navigationFailed],
  );

  const selectHostStar = useCallback(
    async (hostStar: string): Promise<boolean> => {
      const current = navigation.start();
      setResolving(true);
      const result = await reachStar(hostStar).catch(() => null);
      if (!current()) return true;
      setResolving(false);
      if (!result) return false;
      window.history.pushState({}, "", `?star=${encodeURIComponent(result.star.name)}`);
      setSystemHostName(hostStar);
      setActiveObject({ result, type: "star" });
      return true;
    },
    [navigation, navigationFailed],
  );

  const generatePlanet = useCallback(
    ({ parameters, planet, recipe }: CustomWorld): void => {
      const current = navigation.start();
      setResolving(false);
      void import("./custom-destination-url.ts")
        .then(({ customPlanetUrl }) => {
          if (!current()) return;
          window.history.pushState({}, "", customPlanetUrl(parameters));
          setDiscoverOpen(false);
          setActiveObject({
            recipe,
            result: { cached: false, mode: "custom", planet },
            type: "planet",
          });
        })
        .catch(() => {
          if (current()) navigationFailed();
        });
    },
    [navigation, navigationFailed],
  );

  const generateStar = useCallback(
    ({ parameters, star }: CustomStar): void => {
      const current = navigation.start();
      setResolving(false);
      void import("./custom-destination-url.ts")
        .then(({ customStarUrl }) => {
          if (!current()) return;
          window.history.pushState({}, "", customStarUrl(parameters));
          setDiscoverOpen(false);
          setActiveObject({
            result: { cached: false, mode: "custom", star },
            type: "star",
          });
        })
        .catch(() => {
          if (current()) navigationFailed();
        });
    },
    [navigation, navigationFailed],
  );

  const generateBlackHole = useCallback(
    ({ blackHole, parameters }: CustomBlackHole): void => {
      const current = navigation.start();
      setResolving(false);
      void import("./custom-destination-url.ts")
        .then(({ customBlackHoleUrl }) => {
          if (!current()) return;
          window.history.pushState({}, "", customBlackHoleUrl(parameters));
          setDiscoverOpen(false);
          setSystemHostName(null);
          setActiveObject({ blackHole, type: "black-hole" });
        })
        .catch(() => {
          if (current()) navigationFailed();
        });
    },
    [navigation, navigationFailed],
  );

  const returnHome = useCallback((): void => {
    navigation.cancel();
    setResolving(false);
    window.history.replaceState({}, "", "/");
    setSystemHostName(null);
    setActiveObject(defaultPlanetObject());
  }, [navigation, navigationFailed]);

  const openDiscover = useCallback((): void => {
    setPaletteOpen(false);
    setDiscoverOpen(true);
  }, []);

  const closeDiscover = useCallback((): void => setDiscoverOpen(false), []);

  const [tourRevision, setTourRevision] = useState(0);
  const [activeTour, setActiveTour] = useState<ActiveTour | null>(null);
  useEffect(() => {
    const search = window.location.search;
    if (!new URLSearchParams(search).has("tour")) {
      setActiveTour(null);
      return;
    }
    let active = true;
    void import("./tours.ts").then(({ readTour }) => {
      if (active) setActiveTour(readTour(search));
    });
    return () => {
      active = false;
    };
  }, [activeObject, tourRevision]);
  const goToTourStep = useCallback(
    (tourId: string, index: number): void => {
      const current = navigation.start();
      setResolving(true);
      void import("./tours.ts")
        .then(({ findTour, tourStepSearch }) => {
          if (!current()) return;
          const tour = findTour(tourId);
          if (!tour || !tour.steps[index]) {
            setResolving(false);
            return;
          }
          const sameDestination =
            canonicalUrlForSearch(window.location.search) ===
            canonicalUrlForSearch(tourStepSearch(tour, index));
          window.history.pushState({}, "", tourStepSearch(tour, index));
          setDiscoverOpen(false);
          setSystemHostName(null);
          if (!sameDestination) sceneHost?.beginTravel();
          void loadRequestedObject()
            .then((next) => {
              if (!current()) return;
              setResolving(false);
              if (next.type === "missing") sceneHost?.cancelTravel();
              setActiveObject(next);
            })
            .catch(() => {
              if (!current()) return;
              sceneHost?.cancelTravel();
              navigationFailed();
            });
        })
        .catch(() => {
          if (current()) navigationFailed();
        });
    },
    [sceneHost, navigation, navigationFailed],
  );
  const exitTour = useCallback((): void => {
    const parameters = new URLSearchParams(window.location.search);
    parameters.delete("tour");
    parameters.delete("step");
    const search = parameters.toString();
    window.history.replaceState({}, "", search ? `?${search}` : "/");
    setTourRevision((revision) => revision + 1);
  }, []);
  const closePalette = useCallback((): void => setPaletteOpen(false), []);
  const openPalette = useCallback((): void => {
    setDiscoverOpen(false);
    setPaletteOpen(true);
  }, []);
  const toggleChrome = useCallback((): void => setChromeHidden((hidden) => !hidden), []);
  const chrome = useMemo<ChromeActions>(
    () => ({ chromeHidden, openDiscover, openPalette, toggleChrome }),
    [chromeHidden, openDiscover, openPalette, toggleChrome],
  );

  const travelFromPalette = useCallback(
    (target: PaletteTarget): void => {
      setPaletteOpen(false);
      switch (target.type) {
        case "action":
          if (target.action === "discover") setDiscoverOpen(true);
          else if (target.action === "clear-view") setChromeHidden((hidden) => !hidden);
          else returnHome();
          return;
        case "black-hole":
          selectBlackHole(target.blackHole);
          return;
        case "planet":
          selectPlanet(target.planet, target.cached);
          return;
        case "region":
          selectRegion(target.region);
          return;
        case "star":
          selectStar(target.star, target.cached);
          return;
        case "system":
          void selectSystem(target.hostStar);
          return;
        case "tour":
          goToTourStep(target.tourId, 0);
          return;
      }
    },
    [
      goToTourStep,
      returnHome,
      selectBlackHole,
      selectPlanet,
      selectRegion,
      selectStar,
      selectSystem,
    ],
  );

  const subject =
    activeObject && activeObject.type !== "missing"
      ? activeObject.type === "black-hole"
        ? activeObject.blackHole.name
        : activeObject.type === "region"
          ? activeObject.region.name
          : activeObject.type === "planet"
            ? activeObject.result.planet.name
            : activeObject.type === "system"
              ? `the ${activeObject.result.hostStar} system`
              : activeObject.result.star.name
      : null;

  const titleSubject =
    !activeObject || (activeObject.type === "planet" && activeObject.result.mode === "fallback")
      ? null
      : activeObject.type === "missing"
        ? "Destination unavailable"
        : activeObject.type === "system"
          ? `${activeObject.result.hostStar} system`
          : subject;

  useEffect(() => {
    const title = documentTitleFor(titleSubject);
    const description = descriptionFor(titleSubject);
    document.title = title;
    for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) {
      document.querySelector(selector)?.setAttribute("content", title);
    }
    for (const selector of [
      'meta[name="description"]',
      'meta[property="og:description"]',
      'meta[name="twitter:description"]',
    ]) {
      document.querySelector(selector)?.setAttribute("content", description);
    }
  }, [titleSubject]);

  return (
    <ChromeContext value={chrome}>
      <canvas
        ref={setCanvas}
        id="render-canvas"
        aria-label={
          subject ? `Interactive visualization of ${subject}` : "Celestial object visualization"
        }
        tabIndex={0}
      />
      <OfflineNotice />
      <div
        className={cx("travel-veil")}
        data-crossing={travelPhase === "crossing" || undefined}
        aria-hidden="true"
        style={
          {
            "--travel-cross": `${TRAVEL_CROSS_MS}ms`,
            "--travel-reveal": `${TRAVEL_REVEAL_MS}ms`,
          } as CSSProperties
        }
      />
      {sceneHostStatus === "context-lost" || sceneHostStatus === "recovering" ? (
        <RecoveryScreen
          action="Restart now"
          detail={
            sceneHostStatus === "context-lost"
              ? "The browser paused graphics access. Exora will pick up where it was as soon as the GPU is back."
              : "Graphics access is back. Exora is rebuilding the current destination."
          }
          heading={
            sceneHostStatus === "context-lost" ? "Reconnecting to the GPU" : "Restoring the scene"
          }
          onRetry={restartSceneHost}
          pending
        />
      ) : null}
      {sceneHostStatus === "failed" ? (
        <RecoveryScreen
          action="Restart the renderer"
          detail="The graphics session could not be restored. Restarting keeps this destination selected."
          heading="The renderer stopped"
          onRetry={restartSceneHost}
        />
      ) : null}
      {!activeObject ? (
        <LoadingScreen
          detail="Asking the archives for this destination"
          standalone
          title="Finding your destination"
        />
      ) : activeObject.type === "missing" ? (
        <RecoveryScreen
          action={activeObject.retry ? "Retry destination" : "Go to the featured world"}
          detail={
            activeObject.detail ??
            `Exora could not find the ${activeObject.kind} “${activeObject.name}” in its archive, or cannot draw it yet.`
          }
          heading="Destination unavailable"
          onRetry={activeObject.retry ? loadFromLocation : returnHome}
        />
      ) : activeObject.type === "black-hole" ? (
        <Suspense fallback={null}>
          <BlackHoleExperience
            key={activeObject.blackHole.id}
            blackHole={activeObject.blackHole}
            host={sceneHost}
            travelPhase={travelPhase}
          />
        </Suspense>
      ) : activeObject.type === "region" ? (
        <Suspense fallback={null}>
          <RegionExperience
            key={activeObject.region.id}
            host={sceneHost}
            onSelectStar={selectStar}
            region={activeObject.region}
            travelPhase={travelPhase}
          />
        </Suspense>
      ) : activeObject.type === "planet" ? (
        <PlanetExperience
          key={activeObject.result.planet.id}
          host={sceneHost}
          result={activeObject.result}
          onSelectHostStar={selectHostStar}
          onSelectPlanet={selectPlanet}
          onSelectStar={selectStar}
          onSelectSystem={selectSystem}
          recipeOverride={activeObject.recipe ?? null}
          travelPhase={travelPhase}
        />
      ) : activeObject.type === "system" ? (
        <Suspense fallback={null}>
          <SystemExperience
            key={activeObject.result.hostStar}
            host={sceneHost}
            result={activeObject.result}
            onSelectHostStar={selectHostStar}
            onSelectPlanet={selectPlanet}
            onSelectStar={selectStar}
            travelPhase={travelPhase}
          />
        </Suspense>
      ) : (
        <Suspense fallback={null}>
          <StarExperience
            key={activeObject.result.star.id}
            host={sceneHost}
            result={activeObject.result}
            systemHostName={systemHostName}
            onSelectPlanet={selectPlanet}
            onSelectSystem={selectSystem}
            travelPhase={travelPhase}
          />
        </Suspense>
      )}
      {paletteOpen ? (
        <Suspense fallback={null}>
          <CommandPalette onClose={closePalette} onSelect={travelFromPalette} />
        </Suspense>
      ) : null}
      {activeTour &&
      !resolving &&
      activeObject &&
      activeObject.type !== "missing" &&
      !discoverOpen ? (
        <Suspense fallback={null}>
          <TourBar
            active={activeTour}
            hidden={chromeHidden || travelPhase === "departing" || travelPhase === "crossing"}
            onExit={exitTour}
            onStep={(index) => goToTourStep(activeTour.tour.id, index)}
          />
        </Suspense>
      ) : null}
      {discoverOpen && activeObject && activeObject.type !== "missing" ? (
        <Suspense fallback={null}>
          <DiscoverScreen
            initialForgeMode={
              activeObject.type === "star"
                ? "star"
                : activeObject.type === "black-hole"
                  ? "black-hole"
                  : "planet"
            }
            onClose={closeDiscover}
            onGenerateBlackHole={generateBlackHole}
            onGeneratePlanet={generatePlanet}
            onGenerateStar={generateStar}
            onSelectBlackHole={selectBlackHole}
            onSelectPlanet={selectPlanet}
            onSelectRegion={selectRegion}
            onSelectStar={selectStar}
            onStartTour={(tourId) => goToTourStep(tourId, 0)}
          />
        </Suspense>
      ) : null}
    </ChromeContext>
  );
};
