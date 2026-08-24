import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import type { CustomStar, CustomWorld } from "@exora/worldgen";
import { useEffect, useRef, useState } from "react";
import type { AsteroidProfile } from "../solar-asteroids.ts";
import type { CometProfile } from "../solar-comets.ts";
import type { SolarMissionProfile } from "../solar-missions.ts";
import type { SolarRegionProfile } from "../solar-regions.ts";
import { WorldForge } from "./CustomPlanetBuilder.tsx";
import { PlanetCatalog } from "./PlanetCatalog.tsx";
import { SolarSystemCatalog } from "./SolarSystemCatalog.tsx";
import { StarCatalog } from "./StarCatalog.tsx";

export type DiscoverSection = "overview" | "solar" | "worlds" | "stars" | "forge";

interface DiscoverScreenProps {
  initialForgeMode: "planet" | "star";
  initialSection?: DiscoverSection;
  onClose: () => void;
  onGeneratePlanet: (world: CustomWorld) => void;
  onGenerateStar: (star: CustomStar) => void;
  onSelectAsteroid: (asteroid: AsteroidProfile) => void;
  onSelectComet: (comet: CometProfile) => void;
  onSelectMission: (mission: SolarMissionProfile) => void;
  onSelectPlanet: (planet: ExoplanetProfile, cached: boolean) => void;
  onSelectRegion: (region: SolarRegionProfile) => void;
  onSelectStar: (star: StarProfile, cached: boolean) => void;
}

const sections: readonly {
  accent: string;
  description: string;
  eyebrow: string;
  glyph: string;
  id: Exclude<DiscoverSection, "overview">;
  label: string;
  source: string;
}[] = [
  {
    accent: "amber",
    description: "Return to familiar worlds, moons, missions, comets and the deep frontier.",
    eyebrow: "OUR COSMIC ADDRESS",
    glyph: "☉",
    id: "solar",
    label: "Solar System",
    source: "NASA / JPL",
  },
  {
    accent: "cyan",
    description: "Search confirmed exoplanets or follow a curated path beyond the Sun.",
    eyebrow: "DISTANT WORLDS",
    glyph: "◎",
    id: "worlds",
    label: "Exoplanets",
    source: "NASA ARCHIVE",
  },
  {
    accent: "gold",
    description: "Navigate stellar families, iconic lights and nearby host systems.",
    eyebrow: "STELLAR ATLAS",
    glyph: "✦",
    id: "stars",
    label: "Stars",
    source: "SIMBAD",
  },
  {
    accent: "coral",
    description: "Shape a new planet or ignite a star, then enter it immediately.",
    eyebrow: "CELESTIAL SYNTHESIS",
    glyph: "+",
    id: "forge",
    label: "World Forge",
    source: "EXORA LABS",
  },
] as const;

const sectionCopy: Record<DiscoverSection, { eyebrow: string; title: string; summary: string }> = {
  overview: {
    eyebrow: "EXORA UNIVERSE OBSERVATORY",
    title: "All of space. One way in.",
    summary:
      "Move from our home system to distant worlds, stars and objects of your own design without leaving Discover.",
  },
  solar: {
    eyebrow: "NASA / JPL HOME SYSTEM",
    title: "Start close to home.",
    summary: "Search measured bodies, mission targets, dynamic regions and exploration history.",
  },
  worlds: {
    eyebrow: "NASA EXOPLANET ARCHIVE",
    title: "Find another world.",
    summary: "Search by name, explore curated collections, or tune the observatory by physics.",
  },
  stars: {
    eyebrow: "SIMBAD STELLAR ARCHIVE",
    title: "Follow the light.",
    summary: "Search the stellar catalog, browse distinct families, or take a surprise jump.",
  },
  forge: {
    eyebrow: "EXORA CELESTIAL SYNTHESIS",
    title: "Make the next discovery.",
    summary: "Build a world or star from first principles and launch it into the live renderer.",
  },
};

export const DiscoverScreen = ({
  initialForgeMode,
  initialSection = "overview",
  onClose,
  onGeneratePlanet,
  onGenerateStar,
  onSelectAsteroid,
  onSelectComet,
  onSelectMission,
  onSelectPlanet,
  onSelectRegion,
  onSelectStar,
}: DiscoverScreenProps) => {
  const [section, setSection] = useState<DiscoverSection>(initialSection);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    closeRef.current?.focus();
    return () => {
      dialog?.close();
      previousFocus?.focus();
    };
  }, []);

  const copy = sectionCopy[section];

  return (
    <dialog
      ref={dialogRef}
      className={`discover-screen discover-section-${section}`}
      aria-labelledby="discover-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="discover-sky" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <aside className="discover-rail">
        <button
          className="discover-home"
          type="button"
          aria-label="Discover overview"
          aria-current={section === "overview" ? "page" : undefined}
          onClick={() => setSection("overview")}
        >
          <span className="brand-mark" aria-hidden="true" />
          <span>
            <strong>EXORA</strong>
            <small>DISCOVER</small>
          </span>
        </button>

        <nav className="discover-nav" aria-label="Discover destinations">
          {sections.map((item, index) => (
            <button
              className={`discover-nav-item ${item.accent}`}
              key={item.id}
              type="button"
              aria-current={section === item.id ? "page" : undefined}
              onClick={() => setSection(item.id)}
            >
              <span className="discover-nav-index">0{index + 1}</span>
              <span className="discover-nav-glyph" aria-hidden="true">
                {item.glyph}
              </span>
              <span className="discover-nav-copy">
                <strong>{item.label}</strong>
                <small>{item.source}</small>
              </span>
            </button>
          ))}
        </nav>

        <p className="discover-rail-note">
          <span aria-hidden="true" />
          LIVE OBSERVATORY
        </p>
      </aside>

      <div className="discover-stage">
        <header className="discover-header">
          <div>
            <p>{copy.eyebrow}</p>
            <h1 id="discover-title">{copy.title}</h1>
            <span>{copy.summary}</span>
          </div>
          <button
            ref={closeRef}
            className="discover-close"
            type="button"
            aria-label="Close Discover"
            onClick={onClose}
          >
            <span>RETURN TO VIEW</span>
            <kbd>ESC</kbd>
            <i aria-hidden="true">×</i>
          </button>
        </header>

        <main className="discover-main">
          {section === "overview" ? (
            <div className="discover-overview">
              <div className="discover-orbit-map" aria-hidden="true">
                <span className="discover-orbit orbit-one" />
                <span className="discover-orbit orbit-two" />
                <span className="discover-orbit orbit-three" />
                <span className="discover-map-core" />
                <span className="discover-map-object object-one" />
                <span className="discover-map-object object-two" />
                <span className="discover-map-object object-three" />
              </div>
              <div className="discover-portal-grid">
                {sections.map((item) => (
                  <button
                    className={`discover-portal-card ${item.accent}`}
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                  >
                    <span className="discover-card-topline">
                      <small>{item.eyebrow}</small>
                      <span aria-hidden="true">↗</span>
                    </span>
                    <span className="discover-card-glyph" aria-hidden="true">
                      {item.glyph}
                    </span>
                    <span className="discover-card-copy">
                      <strong>{item.label}</strong>
                      <span>{item.description}</span>
                    </span>
                    <small className="discover-card-source">SOURCE · {item.source}</small>
                  </button>
                ))}
              </div>
              <footer className="discover-overview-footer">
                <span>SEARCH REAL CATALOGS</span>
                <span>TRAVEL IN ONE STEP</span>
                <span>KEYBOARD &amp; TOUCH READY</span>
              </footer>
            </div>
          ) : (
            <div className="discover-workspace" aria-live="polite">
              {section === "solar" ? (
                <SolarSystemCatalog
                  embedded
                  onClose={() => setSection("overview")}
                  onSelectAsteroid={onSelectAsteroid}
                  onSelectComet={onSelectComet}
                  onSelectMission={onSelectMission}
                  onSelectPlanet={onSelectPlanet}
                  onSelectRegion={onSelectRegion}
                  onSelectStar={onSelectStar}
                />
              ) : section === "worlds" ? (
                <PlanetCatalog
                  embedded
                  onClose={() => setSection("overview")}
                  onSelect={onSelectPlanet}
                />
              ) : section === "stars" ? (
                <StarCatalog
                  embedded
                  onClose={() => setSection("overview")}
                  onSelect={onSelectStar}
                />
              ) : (
                <WorldForge
                  embedded
                  initialMode={initialForgeMode}
                  onClose={() => setSection("overview")}
                  onGeneratePlanet={onGeneratePlanet}
                  onGenerateStar={onGenerateStar}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </dialog>
  );
};
