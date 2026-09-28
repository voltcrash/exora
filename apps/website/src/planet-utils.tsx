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

const TIMESCALE_UNITS = [
  [1e12, "trillion years"],
  [1e9, "billion years"],
  [1e6, "million years"],
  [1e3, "thousand years"],
] as const;
const twoFigures = new Intl.NumberFormat("en", { maximumSignificantDigits: 2 });

export const formatTimescale = (years: number): string => {
  if (years >= 1e15) return `10^${Math.floor(Math.log10(years))} years`;
  for (const [scale, unit] of TIMESCALE_UNITS) {
    if (years >= scale) return `${twoFigures.format(years / scale)} ${unit}`;
  }
  return years < 1 ? "under a year" : `${twoFigures.format(years)} years`;
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
