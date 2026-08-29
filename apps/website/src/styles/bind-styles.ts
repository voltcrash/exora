type StyleMap = Readonly<Record<string, string>>;

const GLOBAL_STYLE_CONTRACTS = new Set([
  "black-hole-experience",
  "chrome-hidden",
  "experience-shell",
  "scene-error",
  "scene-ready",
  "space-haze",
  "star-experience",
  "subsystem-experience",
  "surface-veil",
  "system-experience",
  "travel-veil",
  "travelling",
  "view-surface",
  "viewport-grid",
]);

export const bindStyles =
  (...styleMaps: readonly StyleMap[]) =>
  (...values: readonly (false | null | string | undefined)[]): string => {
    const classNames = values.flatMap((value) => (value ? value.split(/\s+/) : []));
    const resolved = classNames.flatMap((className) => {
      const moduleClassNames = styleMaps.flatMap((styleMap) => styleMap[className] ?? []);
      return GLOBAL_STYLE_CONTRACTS.has(className)
        ? [className, ...moduleClassNames]
        : moduleClassNames.length > 0
          ? moduleClassNames
          : [className];
    });
    return [...new Set(resolved)].join(" ");
  };
