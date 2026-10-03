import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import type { CustomBlackHole, CustomStar, CustomWorld } from "@exora/worldgen";
import { useEffect, useRef, useState } from "react";
import type { BlackHoleProfile } from "../black-holes.ts";
import type { SolarRegionProfile } from "../solar-regions.ts";
import { WorldForge, type ForgeMode } from "./CustomPlanetBuilder.tsx";
import { BlackHoleCatalog } from "./BlackHoleCatalog.tsx";
import { PlanetAtlas } from "./PlanetAtlas.tsx";
import { PlanetCatalog } from "./PlanetCatalog.tsx";
import { SolarSystemCatalog } from "./SolarSystemCatalog.tsx";
import { StarCatalog } from "./StarCatalog.tsx";
import { TourCatalog } from "./TourCatalog.tsx";
import { BrandMark } from "./shell/BrandMark.tsx";
import { Button } from "./ui/Button.tsx";
import { Icon, type IconName } from "./ui/Icon.tsx";
import { Kbd } from "./ui/Kbd.tsx";
import styles from "./DiscoverScreen.module.css";

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

const sectionCopy: Record<DiscoverSection, { title: string; summary: string }> = {
  solar: {
    title: "Close to home",
    summary: "Every planet, the principal moons and the regions between them, from NASA/JPL.",
  },
  worlds: {
    title: "Find another world",
    summary: "Search the NASA Exoplanet Archive, browse a collection, or filter by physics.",
  },
  atlas: {
    title: "See them all at once",
    summary:
      "Every confirmed planet on the planes astronomers read the population from. Hover to identify, click to travel.",
  },
  tours: {
    title: "Take the long way round",
    summary:
      "Narrated journeys through real destinations. Every stop is a shareable link, and you can leave at any time.",
  },
  stars: {
    title: "Follow the light",
    summary: "Search the SIMBAD stellar archive or browse families of stars.",
  },
  "black-holes": {
    title: "Follow the light to its edge",
    summary: "Observed horizons, from the one at the heart of our galaxy to the heaviest known.",
  },
  forge: {
    title: "Make the next discovery",
    summary: "Build a world, a star or a black hole from first principles, then step into it.",
  },
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

  const copy = sectionCopy[section];

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
                    <small>{item.source}</small>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <p className={styles["rail-tip"]}>
          <Kbd>/</Kbd> jumps straight to anywhere by name
        </p>
      </aside>

      <div ref={stageRef} className={styles["stage"]} data-testid="discover-stage">
        <header className={styles["header"]}>
          <div className={styles["header-copy"]}>
            <h1 id="discover-title">{copy.title}</h1>
            <p>{copy.summary}</p>
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
        </main>
      </div>
    </dialog>
  );
};
