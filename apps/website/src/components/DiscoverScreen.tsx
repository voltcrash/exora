import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import type { CustomBlackHole, CustomStar, CustomWorld } from "@exora/worldgen";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { BlackHoleProfile } from "../black-holes.ts";
import type { SolarRegionProfile } from "../solar-regions.ts";
import type { ForgeMode } from "./CustomPlanetBuilder.tsx";
import { BrandMark } from "./shell/BrandMark.tsx";
import { Button } from "./ui/Button.tsx";
import { Icon, type IconName } from "./ui/Icon.tsx";
import styles from "./DiscoverScreen.module.css";

const BlackHoleCatalog = lazy(() =>
  import("./BlackHoleCatalog.tsx").then((module) => ({ default: module.BlackHoleCatalog })),
);
const PlanetAtlas = lazy(() =>
  import("./PlanetAtlas.tsx").then((module) => ({ default: module.PlanetAtlas })),
);
const PlanetCatalog = lazy(() =>
  import("./PlanetCatalog.tsx").then((module) => ({ default: module.PlanetCatalog })),
);
const SolarSystemCatalog = lazy(() =>
  import("./SolarSystemCatalog.tsx").then((module) => ({ default: module.SolarSystemCatalog })),
);
const StarCatalog = lazy(() =>
  import("./StarCatalog.tsx").then((module) => ({ default: module.StarCatalog })),
);
const TourCatalog = lazy(() =>
  import("./TourCatalog.tsx").then((module) => ({ default: module.TourCatalog })),
);
const WorldForge = lazy(() =>
  import("./CustomPlanetBuilder.tsx").then((module) => ({ default: module.WorldForge })),
);

export type DiscoverSection =
  | "solar"
  | "worlds"
  | "atlas"
  | "tours"
  | "stars"
  | "black-holes"
  | "forge";

interface DiscoverScreenProps {
  initialForgeMode: ForgeMode;
  initialSection?: DiscoverSection;
  onClose: () => void;
  onGenerateBlackHole: (blackHole: CustomBlackHole) => void;
  onGeneratePlanet: (world: CustomWorld) => void;
  onGenerateStar: (star: CustomStar) => void;
  onSelectBlackHole: (blackHole: BlackHoleProfile) => void;
  onSelectPlanet: (planet: ExoplanetProfile, cached: boolean) => void;
  onSelectRegion: (region: SolarRegionProfile) => void;
  onSelectStar: (star: StarProfile, cached: boolean) => void;
  onStartTour: (tourId: string) => void;
}

interface SectionEntry {
  icon: IconName;
  id: DiscoverSection;
  label: string;
  source: string;
}

const NAVIGATION: readonly { label: string; sections: readonly SectionEntry[] }[] = [
  {
    label: "Browse",
    sections: [
      { icon: "planet", id: "worlds", label: "Exoplanets", source: "NASA Exoplanet Archive" },
      { icon: "star", id: "stars", label: "Stars", source: "SIMBAD" },
      { icon: "orbit", id: "solar", label: "Solar System", source: "NASA/JPL" },
      { icon: "black-hole", id: "black-holes", label: "Black Holes", source: "NASA, EHT and ESA" },
    ],
  },
  {
    label: "Learn",
    sections: [
      { icon: "atlas", id: "atlas", label: "Atlas", source: "Every known world" },
      { icon: "route", id: "tours", label: "Guided Tours", source: "Narrated journeys" },
    ],
  },
  {
    label: "Create",
    sections: [{ icon: "forge", id: "forge", label: "World Forge", source: "Your own objects" }],
  },
];

const sectionTitles: Record<DiscoverSection, string> = {
  solar: "Solar System",
  worlds: "Exoplanets",
  atlas: "Planet atlas",
  tours: "Guided tours",
  stars: "Stars",
  "black-holes": "Black holes",
  forge: "World Forge",
};

/*
 * EXPLORE
 *
 * Everywhere Exora can take you, behind one door. A rail of sections on a wide screen, a row of
 * tabs on a phone; each section is a catalogue with its own search. It is a modal dialog, so the
 * scene behind it rests and Escape always leads back to it.
 */
export const DiscoverScreen = ({
  initialForgeMode,
  initialSection = "worlds",
  onClose,
  onGenerateBlackHole,
  onGeneratePlanet,
  onGenerateStar,
  onSelectBlackHole,
  onSelectPlanet,
  onSelectRegion,
  onSelectStar,
  onStartTour,
}: DiscoverScreenProps) => {
  const [section, setSection] = useState<DiscoverSection>(initialSection);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    dialog?.showModal();
    closeRef.current?.focus();
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      dialog?.close();
      previousFocus?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    stageRef.current?.scrollTo({ top: 0 });
  }, [section]);

  return (
    <dialog
      ref={dialogRef}
      className={styles["explore"]}
      data-state={section}
      aria-labelledby="discover-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <aside className={styles["rail"]}>
        <a className={styles["home"]} href="/" aria-label="Exora home">
          <BrandMark />
          <span>Exora</span>
        </a>

        <nav className={styles["nav"]} aria-label="Explore destinations">
          {NAVIGATION.map((group) => (
            <div key={group.label} className={styles["nav-group"]}>
              <p className={styles["nav-label"]}>{group.label}</p>
              {group.sections.map((item) => (
                <button
                  className={styles["nav-item"]}
                  key={item.id}
                  type="button"
                  aria-label={`${item.label} · ${item.source}`}
                  aria-current={section === item.id ? "page" : undefined}
                  onClick={() => setSection(item.id)}
                >
                  <span data-icon={item.id} className={styles["nav-icon"]}>
                    <Icon name={item.icon} size={18} />
                  </span>
                  <span className={styles["nav-copy"]} data-testid="discover-nav-copy">
                    <strong>{item.label}</strong>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div ref={stageRef} className={styles["stage"]} data-testid="discover-stage">
        <header className={styles["header"]}>
          <div className={styles["header-copy"]}>
            <h1 id="discover-title">{sectionTitles[section]}</h1>
          </div>
          <Button
            ref={closeRef}
            className={styles["close"]}
            icon="close"
            variant="secondary"
            aria-label="Close Explore"
            aria-keyshortcuts="Escape"
            onClick={onClose}
          />
        </header>

        <main className={styles["main"]}>
          <Suspense key={section} fallback={<p role="status">Loading destinations…</p>}>
            {section === "solar" ? (
              <SolarSystemCatalog
                onSelectPlanet={onSelectPlanet}
                onSelectRegion={onSelectRegion}
                onSelectStar={onSelectStar}
              />
            ) : section === "worlds" ? (
              <PlanetCatalog onSelect={onSelectPlanet} />
            ) : section === "atlas" ? (
              <PlanetAtlas onSelect={onSelectPlanet} />
            ) : section === "tours" ? (
              <TourCatalog onStart={onStartTour} />
            ) : section === "stars" ? (
              <StarCatalog onSelect={onSelectStar} />
            ) : section === "black-holes" ? (
              <BlackHoleCatalog onSelect={onSelectBlackHole} />
            ) : (
              <WorldForge
                initialMode={initialForgeMode}
                onGenerateBlackHole={onGenerateBlackHole}
                onGeneratePlanet={onGeneratePlanet}
                onGenerateStar={onGenerateStar}
              />
            )}
          </Suspense>
          <footer className={styles["resources"]}>
            <a href="/about/">About Exora</a>
            <a href="/explore/">Planet profiles and tours</a>
            <a href="/guides/">Guides and data sources</a>
          </footer>
        </main>
      </div>
    </dialog>
  );
};
