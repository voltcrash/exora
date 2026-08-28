import type { ExoplanetProfile } from "@exora/contracts";
import type { ReactNode } from "react";

const numberFormatters = new Map<number, Intl.NumberFormat>();
const smallMeasurementFormatter = new Intl.NumberFormat("en", { maximumSignificantDigits: 3 });

const numberFormatter = (maximumFractionDigits: number): Intl.NumberFormat => {
  const existing = numberFormatters.get(maximumFractionDigits);
  if (existing) return existing;
  const created = new Intl.NumberFormat("en", { maximumFractionDigits });
  numberFormatters.set(maximumFractionDigits, created);
  return created;
};

export const formatNumber = (value: number | null, maximumFractionDigits = 1): string =>
  value === null ? "—" : numberFormatter(maximumFractionDigits).format(value);

export const formatMeasurement = (value: number | null, maximumFractionDigits = 1): string => {
  const formatted = formatNumber(value, maximumFractionDigits);
  if (value === null || value === 0 || !/^-?0$/.test(formatted)) return formatted;
  return smallMeasurementFormatter.format(value);
};

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
