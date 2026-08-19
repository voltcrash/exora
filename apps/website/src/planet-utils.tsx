import type { ExoplanetProfile } from "@exora/contracts";
import type { ReactNode } from "react";

export const formatNumber = (value: number | null, maximumFractionDigits = 1): string =>
  value === null ? "—" : new Intl.NumberFormat("en", { maximumFractionDigits }).format(value);

export const formatPlanetName = (name: string): ReactNode => {
  const segments = name.split(" ");
  const suffix = segments.at(-1);

  return suffix && /^[a-z]$/i.test(suffix) ? (
    <>
      {segments.slice(0, -1).join(" ")} <em>{suffix}</em>
    </>
  ) : (
    name
  );
};

export const planetKindLabel = (planet: ExoplanetProfile): string =>
  planet.kind.replace("-", " ").toUpperCase();

export const hasRenderer = (planet: ExoplanetProfile): boolean => planet.kind !== "unknown";
