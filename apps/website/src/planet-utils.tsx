import type { ExoplanetProfile } from "@exora/contracts";
import type { ReactNode } from "react";

/**
 * Number formatters, kept rather than rebuilt.
 *
 * `new Intl.NumberFormat` is one of the most expensive constructors in the language — it resolves
 * a locale and builds a pattern each time — and a catalog row asks for two. Dragging an
 * observatory slider re-rendered two dozen rows per input event, which meant tens of formatters
 * built and thrown away between one frame and the next. There are only ever a couple of distinct
 * shapes, so they are built once and looked up by the only option that varies.
 */
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

/** Preserve small, non-zero measurements that fixed decimal rounding would falsely show as 0. */
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
