import type { ExoplanetProfile, StarProfile } from "@exora/contracts";
import { useMemo, useState } from "react";
import { capitalize } from "../readable.ts";
import type { SolarRegionProfile } from "../solar-regions.ts";
import { SOLAR_SYSTEM_REGIONS } from "../solar-regions.ts";
import { SOLAR_SYSTEM_CATALOG_GROUPS } from "../solar-system.ts";
import { CatalogSearch, ChipRail } from "./catalog/CatalogParts.tsx";
import { Icon } from "./ui/Icon.tsx";
import styles from "./catalog/catalog.module.css";

interface SolarSystemCatalogProps {
  onSelectPlanet: (planet: ExoplanetProfile, cached: boolean) => void;
  onSelectRegion: (region: SolarRegionProfile) => void;
  onSelectStar: (star: StarProfile, cached: boolean) => void;
}

type SolarFilter = "dwarfs" | "moons" | "planets" | "regions";

const FILTERS: readonly { id: SolarFilter; label: string }[] = [
  { id: "planets", label: "Planets" },
  { id: "dwarfs", label: "Dwarf planets" },
  { id: "moons", label: "Moons" },
  { id: "regions", label: "Regions" },
];

const SURFACE_STATUS = {
  mapped: "Surface mapped by spacecraft",
  modeled: "Shape measured · surface unresolved",
  unresolved: "Surface unresolved",
} as const;

export const SolarSystemCatalog = ({
  onSelectPlanet,
  onSelectRegion,
  onSelectStar,
}: SolarSystemCatalogProps) => {
  const [filter, setFilter] = useState<SolarFilter | null>(null);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const visibleGroups = useMemo(
    () =>
      SOLAR_SYSTEM_CATALOG_GROUPS.map((group) => ({
        ...group,
        entries: group.entries.filter((entry) => {
          const bodyType = entry.profile.solarSystem?.bodyType;
          const category =
            bodyType === "moon" ? "moons" : bodyType === "dwarf-planet" ? "dwarfs" : "planets";
          return (
            (filter === null || filter === category) &&
            (normalizedQuery.length === 0 ||
              entry.profile.name.toLocaleLowerCase().includes(normalizedQuery) ||
              entry.profile.solarSystem?.spkId?.includes(normalizedQuery))
          );
        }),
      })).filter((group) => group.entries.length > 0),
    [filter, normalizedQuery],
  );

  const visibleRegions = useMemo(
    () =>
      SOLAR_SYSTEM_REGIONS.filter(
        (region) =>
          (filter === null || filter === "regions") &&
          (normalizedQuery.length === 0 ||
            region.name.toLocaleLowerCase().includes(normalizedQuery) ||
            region.aliases.some((alias) => alias.toLocaleLowerCase().includes(normalizedQuery)) ||
            region.sources.some((source) =>
              source.datasetId.toLocaleLowerCase().includes(normalizedQuery),
            )),
      ),
    [filter, normalizedQuery],
  );

  return (
    <section className={styles["catalog"]} aria-label="Solar System catalog">
      <CatalogSearch
        label="Search the Solar System"
        onChange={setQuery}
        placeholder="Search by name or SPK ID"
        value={query}
      />
      <ChipRail
        active={filter}
        allLabel="Everything"
        groups={[{ chips: FILTERS, label: "Kinds of body" }]}
        label="Filter the Solar System"
        onSelect={(id) => setFilter(id as SolarFilter | null)}
      />

      {visibleGroups.map((group) => (
        <section className={styles["section"]} key={group.label}>
          <h3 className={styles["section-title"]}>{group.label}</h3>
          <ol className={styles["bodies"]}>
            {group.entries.map((entry) => {
              const identity = entry.profile.solarSystem;
              const slug = entry.profile.name.toLocaleLowerCase().replaceAll(" ", "-");
              return (
                <li key={entry.profile.id}>
                  <button
                    className={styles["body"]}
                    type="button"
                    onClick={() => {
                      if (entry.type === "star") onSelectStar(entry.profile, true);
                      else onSelectPlanet(entry.profile, true);
                    }}
                  >
                    <span
                      className={styles["portrait"]}
                      data-body={slug}
                      data-mapped={identity?.texture ? "" : undefined}
                      style={
                        identity?.texture
                          ? { backgroundImage: `url(${identity.texture.path})` }
                          : undefined
                      }
                      aria-hidden="true"
                    />
                    <span className={styles["body-copy"]}>
                      <small>
                        {capitalize(identity?.bodyType.replace("-", " ") ?? "body")}
                        {identity?.parent ? ` of ${identity.parent}` : ""}
                        {" · "}
                        {identity?.spkId
                          ? `SPK ${identity.spkId}`
                          : `NAIF ${String(identity?.naifId)}`}
                      </small>
                      <strong>{entry.profile.name}</strong>
                      <span>{identity?.summary}</span>
                      {identity?.surfaceStatus ? (
                        <em className={styles["evidence"]} data-status={identity.surfaceStatus}>
                          {SURFACE_STATUS[identity.surfaceStatus]}
                        </em>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {visibleRegions.length > 0 ? (
        <section className={styles["section"]}>
          <h3 className={styles["section-title"]}>
            Regions · statistical populations and measured boundaries
          </h3>
          <ol className={styles["bodies"]}>
            {visibleRegions.map((region) => (
              <li key={region.id}>
                <button
                  className={styles["body"]}
                  type="button"
                  onClick={() => onSelectRegion(region)}
                >
                  <span className={styles["portrait"]} data-region={region.kind} aria-hidden="true">
                    <Icon name="orbit" size={28} />
                  </span>
                  <span className={styles["body-copy"]}>
                    <small>
                      Region of the {region.parent} · NAIF {region.anchorNaifId}
                    </small>
                    <strong>{region.name}</strong>
                    <span>{region.summary}</span>
                    <em className={styles["evidence"]} data-status={region.evidence}>
                      {capitalize(region.evidence.replaceAll("-", " "))} · sampled visualization
                    </em>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {visibleGroups.length === 0 && visibleRegions.length === 0 ? (
        <p className={styles["status"]} role="status">
          Nothing in the Solar System matches that. Try another name or filter.
        </p>
      ) : null}
    </section>
  );
};
