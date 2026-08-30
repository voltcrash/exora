import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import type { CustomBlackHole, CustomStar, CustomWorld } from "@exora/worldgen";
import { useEffect, useRef, useState } from "react";
import type { BlackHoleProfile } from "../black-holes.ts";
import type { SolarRegionProfile } from "../solar-regions.ts";
import { WorldForge, type ForgeMode } from "./CustomPlanetBuilder.tsx";
import { BlackHoleCatalog } from "./BlackHoleCatalog.tsx";
import { PlanetCatalog } from "./PlanetCatalog.tsx";
import { SolarSystemCatalog } from "./SolarSystemCatalog.tsx";
import { StarCatalog } from "./StarCatalog.tsx";
import styles from "./DiscoverScreen.module.css";
import sharedStyles from "./ExperienceShared.module.css";

export type DiscoverSection = "solar" | "worlds" | "stars" | "black-holes" | "forge";

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
}

const sections: readonly {
  accent: string;
  id: DiscoverSection;
  label: string;
  source: string;
}[] = [
  {
    accent: "cyan",
    id: "worlds",
    label: "Exoplanets",
    source: "NASA ARCHIVE",
  },
  {
    accent: "gold",
    id: "stars",
    label: "Stars",
    source: "SIMBAD",
  },
  {
    accent: "amber",
    id: "solar",
    label: "Solar System",
    source: "NASA / JPL",
  },
  {
    accent: "violet",
    id: "black-holes",
    label: "Black Holes",
    source: "NASA / EHT / ESA",
  },
  {
    accent: "coral",
    id: "forge",
    label: "World Forge",
    source: "EXORA LABS",
  },
] as const;

const DiscoverIcon = ({ section }: { section: DiscoverSection }) => (
  <svg
    className={styles["discover-nav-icon"]}
    data-icon={section}
    viewBox="0 0 32 32"
    aria-hidden="true"
  >
    {section === "solar" ? (
      <>
        <circle cx="16" cy="16" r="4" />
        <ellipse cx="16" cy="16" rx="12" ry="6.5" />
        <circle className={styles["icon-fill"]} cx="26" cy="14" r="1.8" />
      </>
    ) : section === "worlds" ? (
      <>
        <circle cx="16" cy="16" r="9" />
        <path d="M10 10.5c4.8 1.2 8.8 5.4 11 11" />
        <path d="M6 21.5c6-2.8 13.3-2 20 2.5" />
      </>
    ) : section === "stars" ? (
      <>
        <path d="m16 3 2.4 8.6L27 14l-8.6 2.4L16 25l-2.4-8.6L5 14l8.6-2.4L16 3Z" />
        <path d="m25 5 .8 3.2L29 9l-3.2.8L25 13l-.8-3.2L21 9l3.2-.8L25 5Z" />
      </>
    ) : section === "black-holes" ? (
      <>
        <circle className={styles["icon-fill"]} cx="16" cy="16" r="5" />
        <ellipse cx="16" cy="16" rx="13" ry="7" transform="rotate(-18 16 16)" />
        <path d="M4.5 21c6-3 17.5-6.5 23-10" />
      </>
    ) : (
      <>
        <circle cx="16" cy="16" r="10.5" />
        <path d="M16 9v14M9 16h14" />
        <path d="M11 11 8.5 8.5M21 21l2.5 2.5M21 11l2.5-2.5M11 21l-2.5 2.5" />
      </>
    )}
  </svg>
);

const sectionCopy: Record<DiscoverSection, { eyebrow: string; title: string; summary: string }> = {
  solar: {
    eyebrow: "NASA / JPL HOME SYSTEM",
    title: "Close to home.",
    summary: "Search measured worlds and dynamic regions across our home system.",
  },
  worlds: {
    eyebrow: "NASA EXOPLANET ARCHIVE",
    title: "Find another world.",
    summary: "Search by name, explore curated collections, or tune the observatory by physics.",
  },
  stars: {
    eyebrow: "SIMBAD STELLAR ARCHIVE",
    title: "Follow the light.",
    summary: "Search the stellar catalog or browse distinct stellar families.",
  },
  "black-holes": {
    eyebrow: "NASA / EHT / ESA COMPACT OBJECT ATLAS",
    title: "Follow the light to its edge.",
    summary: "Search observed horizons or browse them by curated journey and horizon family.",
  },
  forge: {
    eyebrow: "EXORA CELESTIAL SYNTHESIS",
    title: "Make the next discovery.",
    summary:
      "Build a world, star, or black hole from first principles and launch it into the live renderer.",
  },
};

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
      className={styles["discover-screen"]}
      data-state={section}
      aria-labelledby="discover-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className={styles["discover-sky"]} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <aside className={styles["discover-rail"]}>
        <button
          className={styles["discover-home"]}
          type="button"
          aria-label="Open Solar System"
          onClick={() => setSection("solar")}
        >
          <span
            className={sharedStyles["brand-mark"]}
            data-style-role="brand-mark"
            aria-hidden="true"
          />
          <span>
            <strong>EXORA</strong>
            <small>DISCOVER</small>
          </span>
        </button>

        <nav className={styles["discover-nav"]} aria-label="Discover destinations">
          {sections.map((item, index) => (
            <button
              className={`${styles["discover-nav-item"]} ${styles[item.accent]}`}
              key={item.id}
              type="button"
              aria-label={`${item.label} · ${item.source}`}
              aria-current={section === item.id ? "page" : undefined}
              onClick={() => setSection(item.id)}
            >
              <span className={styles["discover-nav-index"]}>0{index + 1}</span>
              <span className={styles["discover-nav-glyph"]} aria-hidden="true">
                <DiscoverIcon section={item.id} />
              </span>
              <span className={styles["discover-nav-copy"]} data-testid="discover-nav-copy">
                <strong>{item.label}</strong>
                <small>{item.source}</small>
              </span>
            </button>
          ))}
        </nav>

        <p className={styles["discover-rail-note"]}>
          <span aria-hidden="true" />
          LIVE OBSERVATORY
        </p>
      </aside>

      <div ref={stageRef} className={styles["discover-stage"]} data-testid="discover-stage">
        <header className={styles["discover-header"]}>
          <div>
            <p>{copy.eyebrow}</p>
            <h1 id="discover-title">{copy.title}</h1>
            <span>{copy.summary}</span>
          </div>
          <button
            ref={closeRef}
            className={styles["discover-close"]}
            type="button"
            aria-label="Close Discover"
            onClick={onClose}
          >
            <span>RETURN TO VIEW</span>
            <kbd aria-label="Backspace or Delete">⌫</kbd>
            <i aria-hidden="true">×</i>
          </button>
        </header>

        <main className={styles["discover-main"]}>
          <div className={styles["discover-workspace"]} aria-live="polite">
            {section === "solar" ? (
              <SolarSystemCatalog
                embedded
                onClose={() => setSection("solar")}
                onSelectPlanet={onSelectPlanet}
                onSelectRegion={onSelectRegion}
                onSelectStar={onSelectStar}
              />
            ) : section === "worlds" ? (
              <PlanetCatalog
                embedded
                onClose={() => setSection("solar")}
                onSelect={onSelectPlanet}
              />
            ) : section === "stars" ? (
              <StarCatalog embedded onClose={() => setSection("solar")} onSelect={onSelectStar} />
            ) : section === "black-holes" ? (
              <BlackHoleCatalog
                embedded
                onClose={() => setSection("solar")}
                onSelect={onSelectBlackHole}
              />
            ) : (
              <WorldForge
                embedded
                initialMode={initialForgeMode}
                onClose={() => setSection("solar")}
                onGenerateBlackHole={onGenerateBlackHole}
                onGeneratePlanet={onGeneratePlanet}
                onGenerateStar={onGenerateStar}
              />
            )}
          </div>
        </main>
      </div>
    </dialog>
  );
};
